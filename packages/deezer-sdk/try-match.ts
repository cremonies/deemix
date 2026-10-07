// Try the track matcher from the terminal.
//
//   npx tsx try-match.ts "Auli'i Cravalho" "How Far I'll Go"
//   npx tsx try-match.ts "Auli'i Cravalho" "How Far I'll Go" "Moana (Original Motion Picture Soundtrack/Deluxe Edition)"
//
// Prints the track get_track_id_from_metadata picks, then the title-search
// results with the score each one got (accepted at or above the threshold,
// -1 means rejected: different song or unrelated artist).
import { Deezer } from "./src/deezer.js";
import {
	ACCEPT_THRESHOLD,
	baseForQuery,
	queryValue,
	scoreCandidate,
	type CandidateTrack,
} from "./src/track-match.js";

const [artist, title, album] = process.argv.slice(2);
if (!artist || !title) {
	console.log('usage: npx tsx try-match.ts "<artist>" "<title>" ["<album>"]');
	process.exit(1);
}

const dz = new Deezer();
console.log(`\nLooking for: ${artist} - ${title}   album: ${album || "(not given)"}\n`);

const id = await dz.api.get_track_id_from_metadata(artist, title, album);

if (id === "0") {
	console.log('RESULT: no confident match (function returned "0")');
} else {
	const t: any = await dz.api.call(`track/${id}`);
	console.log("RESULT");
	console.log(`  id      ${t.id}`);
	console.log(`  title   ${t.title}`);
	console.log(`  artist  ${t.artist?.name}`);
	console.log(`  album   ${t.album?.title}`);
	console.log(`  isrc    ${t.isrc}`);
	console.log(`  link    ${t.link}`);
}

const titleQuery = queryValue(baseForQuery(title)) || queryValue(title);
const resp: any = await dz.api.search_track(`track:"${titleQuery}"`, { limit: 100 });
const wanted = { artist, title, album };
const rows = ((resp?.data ?? []) as CandidateTrack[]).map((c, i) => ({
	rank: i + 1,
	score: scoreCandidate(wanted, c),
	id: c.id,
	title: c.title.length > 50 ? c.title.slice(0, 49) + "…" : c.title,
	artist: c.artist?.name,
	album: c.album?.title && c.album.title.length > 40 ? c.album.title.slice(0, 39) + "…" : c.album?.title,
}));
const accepted = rows.filter((r) => r.score >= ACCEPT_THRESHOLD).length;
const rejected = rows.filter((r) => r.score < 0).length;
console.log(
	`\ntrack:"${titleQuery}"  ->  Deezer total ${resp?.total}, scored first ${rows.length}: ` +
		`${accepted} accepted (>= ${ACCEPT_THRESHOLD}), ${rejected} rejected, ${rows.length - accepted - rejected} below threshold`
);
console.log("Top 12 by score (rank = position in Deezer's own results):");
rows.sort((a, b) => b.score - a.score || a.rank - b.rank);
const pad = (v: unknown, n: number) => String(v ?? "").padEnd(n);
console.log(`${pad("rank", 5)}${pad("score", 6)}${pad("id", 12)}${pad("title", 52)}${pad("artist", 24)}album`);
for (const r of rows.slice(0, 12)) {
	console.log(`${pad(r.rank, 5)}${pad(r.score, 6)}${pad(r.id, 12)}${pad(r.title, 52)}${pad(r.artist, 24)}${r.album ?? ""}`);
}
