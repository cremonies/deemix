// Ranking for free-text track search results. Pure functions, no network.
//
// Why this exists: Deezer's own ranking puts reprises, karaoke, key-shifted and
// cover versions ahead of the original recording, and sometimes leaves the
// original out of a free-text search altogether. This keeps every result but
// moves the one the query actually names to the top.

import {
	NEUTRAL_SUFFIX,
	NOISE_TERMS,
	hasWord,
	normalize,
	splitTitle,
} from "./track-match.js";

export interface RankInput {
	title: string;
	/** Main artist */
	artist?: string;
	/** Other credited artists, if the source lists them */
	artists?: string[];
	album?: string;
}

function collapse(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

/** Higher is a better match for what was typed. Only the order matters. */
export function scoreForQuery(query: string, track: RankInput): number {
	const q = normalize(query);
	if (!q) return 0;

	const names = [track.artist, ...(track.artists ?? [])]
		.map((n) => normalize(n))
		.filter(Boolean);
	// The longest credited name that appears in the query as whole words
	const named = names
		.filter((n) => hasWord(q, n))
		.sort((a, b) => b.length - a.length)[0];
	const rest = named ? collapse(` ${q} `.replace(` ${named} `, " ")) : q;

	const split = splitTitle(track.title);
	const full = normalize(track.title);

	let score = 0;
	if (named) score += 30;

	// Only harmless labels ("Remastered", "From \"Movie\"", "feat. X") after the
	// base title count the same as an exact title
	const onlyNeutralLabels = split.suffixes.every(
		(suffix) => NEUTRAL_SUFFIX.test(suffix) || hasWord(q, suffix)
	);
	if (rest && full === rest) score += 55;
	else if (rest && split.base === rest) score += onlyNeutralLabels ? 55 : 50;
	else if (split.base && hasWord(rest, split.base)) score += 25; // extra words typed (album, etc.)
	else if (rest && hasWord(full, rest)) score += 15; // only part of the title typed

	// Version labels the query did not ask for: (Reprise), (Live), - Remix, ...
	for (const suffix of split.suffixes) {
		if (hasWord(q, suffix)) continue;
		if (!NEUTRAL_SUFFIX.test(suffix)) score -= 35;
	}

	// Karaoke, instrumental, tribute, etc. in the title or album
	const text = normalize(`${track.title} ${track.album ?? ""}`);
	for (const term of NOISE_TERMS) {
		const t = normalize(term);
		if (hasWord(text, t) && !hasWord(q, t)) score -= 40;
	}
	// "+3Key", "-5Key" pitch-shifted karaoke versions
	if (/(^| )[+-]?\d+ ?key( |$)/.test(normalize(track.title)) && !/\bkey\b/.test(q)) {
		score -= 40;
	}

	return score;
}

/** Same items, best match first. Equal scores keep their original order. */
export function rankSearchResults<T>(
	query: string,
	items: T[],
	read: (item: T) => RankInput | null | undefined
): T[] {
	return items
		.map((item, index) => {
			const input = read(item);
			return { item, index, score: input ? scoreForQuery(query, input) : 0 };
		})
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map((x) => x.item);
}

/**
 * Split "artist title" into the part that is the title, when one of the
 * given artist names appears in the query. Keeps the user's own spelling.
 * Returns the whole query when no artist name is found.
 */
export function titlePartOfQuery(query: string, artistNames: string[]): string {
	const q = normalize(query);
	const named = artistNames
		.filter((n) => n && hasWord(q, normalize(n)))
		.sort((a, b) => normalize(b).length - normalize(a).length)[0];
	if (!named) return query.trim();

	const escaped = named.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const cut = query.replace(new RegExp(escaped, "i"), " ");
	if (collapse(cut) !== collapse(query)) return collapse(cut);
	// Spelling differs (curly apostrophes etc.): fall back to the normalized rest
	return collapse(` ${q} `.replace(` ${normalize(named)} `, " "));
}

/**
 * Read a track from either Deezer shape: the public API
 * (`title`, `artist.name`) or the gateway (`SNG_TITLE`, `ART_NAME`,
 * with the version label in `VERSION`).
 */
export function readTrackForRank(t: any): RankInput {
	const version = t?.VERSION ?? t?.title_version ?? "";
	const base = t?.SNG_TITLE ?? t?.title ?? "";
	const title =
		version && !String(base).includes(version) ? `${base} ${version}` : String(base);
	const gatewayArtists = Array.isArray(t?.ARTISTS)
		? t.ARTISTS.map((a: any) => a?.ART_NAME)
		: [];
	const apiArtists = Array.isArray(t?.contributors)
		? t.contributors.map((c: any) => c?.name)
		: [];
	return {
		title,
		artist: t?.ART_NAME ?? t?.artist?.name,
		artists: [...gatewayArtists, ...apiArtists].filter(
			(n): n is string => typeof n === "string" && n.length > 0
		),
		album: t?.ALB_TITLE ?? t?.album?.title,
	};
}

/** Track id in either shape, as a string. */
export function trackIdOf(t: any): string {
	return String(t?.SNG_ID ?? t?.id ?? "");
}

/**
 * Gateway tracks plus extra tracks from the public API, without duplicates,
 * ordered best match first. The gateway search can leave the original out
 * entirely, so the extras are where it comes back from.
 */
export function rankMixedTracks(query: string, gatewayTracks: any[], extraTracks: any[]): any[] {
	const seen = new Set<string>();
	const all: any[] = [];
	for (const t of [...gatewayTracks, ...extraTracks]) {
		const id = trackIdOf(t);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		all.push(t);
	}
	return rankSearchResults(query, all, readTrackForRank);
}
