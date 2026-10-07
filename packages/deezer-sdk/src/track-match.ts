// Pure helpers for picking the right track out of Deezer search results.
// No network access and no imports, so it is easy to test.
//
// Why this exists: Deezer's `artist:"..."` search filter no longer matches
// artist credits (tested October 2026), so artist matching is done on our side.

export interface WantedTrack {
	artist: string;
	title: string;
	album?: string;
	/** Deezer artist id, if known. Strongest artist signal. */
	artistId?: number | string;
}

export interface CandidateTrack {
	id: number | string;
	title: string;
	artist?: { id?: number | string; name?: string };
	album?: { title?: string };
	/** Only present when the full track was fetched (`track/{id}`). */
	contributors?: { id?: number | string; name?: string }[];
}

export const ACCEPT_THRESHOLD = 65;

// Words that mark a recording as something other than the original release.
// Only counted when the wanted title does not contain them itself.
const NOISE_TERMS = [
	"karaoke",
	"instrumental",
	"originally performed",
	"in the style of",
	"tribute",
	"backing track",
	"made famous",
	"music box",
	"lullaby",
	"8 bit",
	"piano version",
	"acoustic guitar",
];

// Parenthetical / dash suffixes that do not change which song it is.
const NEUTRAL_SUFFIX =
	/^(feat|ft|featuring|with|remaster|remastered|\d{4} remaster|\d{4} remastered|mono|stereo|radio edit|album version|single version|explicit|clean|deluxe|from .+)/;

export function normalize(input: string | undefined | null): string {
	if (!input) return "";
	return input
		.toLowerCase()
		.replace(/[‘’ʼ`´]/g, "'")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

export interface SplitTitle {
	base: string;
	suffixes: string[];
}

/** "Get Lucky (feat. X) - Radio Edit" -> base "get lucky", suffixes ["feat x", "radio edit"] */
export function splitTitle(title: string): SplitTitle {
	const suffixes: string[] = [];
	let rest = title.replace(/[–—]/g, "-");
	rest = rest.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (_m, a, b) => {
		const s = normalize(a ?? b);
		if (s) suffixes.push(s);
		return " ";
	});
	const dash = rest.indexOf(" - ");
	if (dash !== -1) {
		const s = normalize(rest.slice(dash + 3));
		if (s) suffixes.push(s);
		rest = rest.slice(0, dash);
	}
	return { base: normalize(rest), suffixes };
}

function hasWord(haystack: string, needle: string): boolean {
	if (!needle) return false;
	return ` ${haystack} `.includes(` ${needle} `);
}

function titleScore(wanted: SplitTitle, wantedFull: string, cand: string): number {
	const c = splitTitle(cand);
	if (normalize(cand) === wantedFull) return 50;
	if (c.base !== wanted.base) return -1; // reject: different song

	// Same base title. Look at suffixes the wanted title doesn't have.
	const extra = c.suffixes.filter((s) => !wanted.suffixes.includes(s));
	const allNeutral = extra.every((s) => NEUTRAL_SUFFIX.test(s));
	return allNeutral ? 45 : 10;
}

function artistScore(wanted: WantedTrack, cand: CandidateTrack): number {
	const wantedName = normalize(wanted.artist);
	const people = [cand.artist, ...(cand.contributors ?? [])].filter(Boolean);

	if (wanted.artistId !== undefined && wanted.artistId !== null) {
		if (people.some((p) => String(p?.id) === String(wanted.artistId))) return 40;
	}
	let best = 0;
	for (const [i, p] of people.entries()) {
		const n = normalize(p?.name);
		if (!n || !wantedName) continue;
		const primary = i === 0;
		if (n === wantedName) best = Math.max(best, primary ? 40 : 35);
		else if (hasWord(n, wantedName) || hasWord(wantedName, n))
			best = Math.max(best, primary ? 10 : 8); // "Daft Punk Experience" is not Daft Punk
	}
	return best;
}

function albumScore(wanted: WantedTrack, cand: CandidateTrack): number {
	if (!wanted.album || !cand.album?.title) return 0;
	const a = normalize(wanted.album);
	const b = normalize(cand.album.title);
	if (a === b) return 12;
	if (splitTitle(wanted.album).base === splitTitle(cand.album.title).base) return 8;
	return 0;
}

function noisePenalty(wantedFull: string, cand: CandidateTrack): number {
	const text = normalize(`${cand.title} ${cand.album?.title ?? ""}`);
	let penalty = 0;
	for (const term of NOISE_TERMS) {
		const t = normalize(term);
		if (hasWord(text, t) && !hasWord(wantedFull, t)) penalty += 40;
	}
	return penalty;
}

/** Score one candidate. Returns a number; below ACCEPT_THRESHOLD means "not it". */
export function scoreCandidate(wanted: WantedTrack, cand: CandidateTrack): number {
	const wantedSplit = splitTitle(wanted.title);
	const wantedFull = normalize(wanted.title);
	const t = titleScore(wantedSplit, wantedFull, cand.title);
	if (t < 0) return -1;
	const a = artistScore(wanted, cand);
	if (a === 0) return -1; // never accept a track by an unrelated artist
	return t + a + albumScore(wanted, cand) - noisePenalty(wantedFull, cand);
}

export interface Pick {
	candidate: CandidateTrack;
	score: number;
}

/** Best candidate at or above the threshold, or null. Ties keep Deezer's own order. */
export function pickBest(
	wanted: WantedTrack,
	candidates: CandidateTrack[],
	threshold = ACCEPT_THRESHOLD
): Pick | null {
	let best: Pick | null = null;
	for (const candidate of candidates) {
		const score = scoreCandidate(wanted, candidate);
		if (score >= threshold && (!best || score > best.score)) {
			best = { candidate, score };
		}
	}
	return best;
}

/** Candidates whose title matches but whose artist didn't, worth a contributors lookup. */
export function needsContributorLookup(
	wanted: WantedTrack,
	candidates: CandidateTrack[],
	max = 8
): CandidateTrack[] {
	const wantedSplit = splitTitle(wanted.title);
	const wantedFull = normalize(wanted.title);
	return candidates
		.filter((c) => titleScore(wantedSplit, wantedFull, c.title) >= 45)
		.filter((c) => noisePenalty(wantedFull, c) === 0)
		.slice(0, max);
}

/** Make a value safe inside a Deezer advanced query: track:"..." */
export function queryValue(value: string): string {
	return value.replace(/["“”]/g, " ").replace(/\s+/g, " ").trim();
}

/** Title without (..), [..] and " - .." parts, keeping original case and accents, for use in a query. */
export function baseForQuery(title: string): string {
	let t = title.replace(/[\u2013\u2014]/g, "-");
	t = t.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
	const dash = t.indexOf(" - ");
	if (dash !== -1) t = t.slice(0, dash);
	return t.replace(/\s+/g, " ").trim();
}
