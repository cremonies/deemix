import { describe, expect, test } from "vitest";
import {
	rankMixedTracks,
	rankSearchResults,
	readTrackForRank,
	scoreForQuery,
	titlePartOfQuery,
	type RankInput,
} from "../search-rank.js";

// Shapes and order taken from a live api.deezer.com search, October 2026.
const cravalho = "Auli'i Cravalho";
const howFarResults: RankInput[] = [
	{ title: "How Far I'll Go (Reprise)", artist: cravalho },
	{ title: "How Far I'll Go (原曲歌手:Auli'i Cravalho)", artist: "歌っちゃ王" },
	{ title: "How Far I'll Go +3Key(原曲歌手:Auli'i Cravalho)", artist: "歌っちゃ王" },
	{ title: "How Far I'll Go (Alessia Cara Version)", artist: "Alessia Cara" },
	{ title: "How Far I'll Go", artist: "daigoro789" },
	{ title: "How Far I'll Go", artist: cravalho, album: "Moana (Original Motion Picture Soundtrack/Deluxe Edition)" },
	{ title: "How Far I'll Go", artist: "Jonathan Young" },
];

const titles = (rows: RankInput[]) => rows.map((r) => `${r.title} | ${r.artist}`);
const rank = (query: string, rows: RankInput[]) => rankSearchResults(query, rows, (r) => r);

describe("rankSearchResults", () => {
	test("the original by the named artist comes first", () => {
		const out = rank("Auli'i Cravalho How Far I'll Go", howFarResults);
		expect(titles(out)[0]).toBe(`How Far I'll Go | ${cravalho}`);
	});

	test("the reprise, karaoke and key-shifted tracks go below the original", () => {
		const out = titles(rank("Auli'i Cravalho How Far I'll Go", howFarResults));
		const original = out.indexOf(`How Far I'll Go | ${cravalho}`);
		expect(out.indexOf(`How Far I'll Go (Reprise) | ${cravalho}`)).toBeGreaterThan(original);
		const karaoke = out.filter((t) => t.includes("歌っちゃ王"));
		for (const k of karaoke) expect(out.indexOf(k)).toBeGreaterThan(out.indexOf(`How Far I'll Go | daigoro789`));
	});

	test("asking for the reprise puts the reprise first", () => {
		const out = titles(rank("Auli'i Cravalho How Far I'll Go reprise", howFarResults));
		expect(out[0]).toBe(`How Far I'll Go (Reprise) | ${cravalho}`);
	});

	test("curly apostrophes in the query still match the artist", () => {
		const out = titles(rank("Auli’i Cravalho How Far I’ll Go", howFarResults));
		expect(out[0]).toBe(`How Far I'll Go | ${cravalho}`);
	});

	test("the studio version beats Taylor's Version and remixes", () => {
		const rows: RankInput[] = [
			{ title: "Love Story (Taylor’s Version)", artist: "Taylor Swift" },
			{ title: "Love Story (Digital Dog Remix)", artist: "Taylor Swift" },
			{ title: "Love Story (Live From Clear Channel Stripped 2008)", artist: "Taylor Swift" },
			{ title: "Love Story", artist: "Taylor Swift" },
		];
		expect(rank("Taylor Swift Love Story", rows)[0]?.title).toBe("Love Story");
	});

	test("asking for a version keeps it first", () => {
		const rows: RankInput[] = [
			{ title: "Love Story", artist: "Taylor Swift" },
			{ title: "Love Story (Taylor’s Version)", artist: "Taylor Swift" },
		];
		expect(rank("Taylor Swift Love Story Taylor's Version", rows)[0]?.title).toBe(
			"Love Story (Taylor’s Version)"
		);
	});

	test("harmless suffixes are not penalised", () => {
		const rows: RankInput[] = [
			{ title: "Get Lucky - Radio Edit", artist: "Daft Punk" },
			{ title: "Arabian Nights (Remastered 2022)", artist: "Bruce Adler" },
			{ title: "Arabian Nights (Live)", artist: "Bruce Adler" },
		];
		const out = rank("Bruce Adler Arabian Nights", rows);
		expect(out[0]?.title).toBe("Arabian Nights (Remastered 2022)");
		const names = out.map((r) => r.title);
		expect(names.indexOf("Arabian Nights (Live)")).toBeGreaterThan(0);
		// an unrelated song is still below a live version of the one asked for
		expect(names.indexOf("Get Lucky - Radio Edit")).toBeGreaterThan(names.indexOf("Arabian Nights (Live)"));
	});

	test("a co-credited artist counts as the named artist", () => {
		const rows: RankInput[] = [
			{ title: "Song", artist: "Someone Else" },
			{ title: "Song", artist: "Main Name", artists: ["Main Name", "Guest Person"] },
		];
		expect(rank("Guest Person Song", rows)[0]?.artist).toBe("Main Name");
	});

	test("equal scores keep Deezer's own order and nothing is dropped", () => {
		const rows: RankInput[] = [
			{ title: "How Far I'll Go", artist: "A" },
			{ title: "How Far I'll Go", artist: "B" },
			{ title: "How Far I'll Go", artist: "C" },
		];
		const out = rank("how far i'll go", rows);
		expect(out.map((r) => r.artist)).toEqual(["A", "B", "C"]);
		expect(rank("anything", howFarResults)).toHaveLength(howFarResults.length);
	});

	test("an empty query leaves the order alone", () => {
		expect(scoreForQuery("", { title: "x" })).toBe(0);
		expect(rank("", howFarResults)).toEqual(howFarResults);
	});
});

describe("titlePartOfQuery", () => {
	test("removes the artist the results name", () => {
		expect(titlePartOfQuery("Auli'i Cravalho How Far I'll Go", [cravalho, "歌っちゃ王"])).toBe(
			"How Far I'll Go"
		);
	});
	test("works when the artist comes last", () => {
		expect(titlePartOfQuery("How Far I'll Go Auli'i Cravalho", [cravalho])).toBe("How Far I'll Go");
	});
	test("falls back when the apostrophe differs", () => {
		const out = titlePartOfQuery("Auli’i Cravalho How Far I’ll Go", [cravalho]);
		expect(out.toLowerCase()).toContain("how far");
		expect(out.toLowerCase()).not.toContain("cravalho");
	});
	test("returns the whole query when no artist is named", () => {
		expect(titlePartOfQuery("How Far I'll Go", [cravalho])).toBe("How Far I'll Go");
	});
});

// Gateway (deezer.pageSearch) tracks as returned in October 2026: the original is missing.
const gw = (id: string, title: string, version: string, artist: string, album: string, rank = "0") => ({
	SNG_ID: id,
	SNG_TITLE: title,
	VERSION: version,
	ART_NAME: artist,
	ALB_TITLE: album,
	RANK_SNG: rank,
	ARTISTS: [{ ART_NAME: artist }],
});
const gatewayTracks = [
	gw("136340812", "How Far I'll Go", "(Reprise)", cravalho, "Moana (Original Motion Picture Soundtrack/Deluxe Edition)", "400000"),
	gw("1434887672", "How Far I'll Go (原曲歌手:Auli'i Cravalho)", "", "歌っちゃ王", "How Far I'll Go(ガイド無しカラオケ)"),
	gw("1434887702", "How Far I'll Go +3Key(原曲歌手:Auli'i Cravalho)", "", "歌っちゃ王", "How Far I'll Go(ガイド無しカラオケ)"),
	gw("3890762711", "How Far I'll Go (Originally Performed by Auli'i Cravalho) (Karaoke Version)", "", "karaoke SESH", "Karaoke"),
];
// Public API tracks: the original is here.
const apiTracks = [
	{ id: 136340808, title: "How Far I'll Go", title_version: "", artist: { name: cravalho }, album: { title: "Moana (Original Motion Picture Soundtrack/Deluxe Edition)" } },
	{ id: 136340812, title: "How Far I'll Go (Reprise)", title_version: "", artist: { name: cravalho }, album: { title: "Moana (Original Motion Picture Soundtrack/Deluxe Edition)" } },
	{ id: 140977801, title: "How Far I'll Go", title_version: "", artist: { name: "daigoro789" }, album: { title: "x" } },
];

describe("rankMixedTracks", () => {
	const ids = (rows: any[]) => rows.map((t) => String(t.SNG_ID ?? t.id));

	test("brings the original in from the public API and puts it first", () => {
		const out = rankMixedTracks("Auli'i Cravalho How Far I'll Go", gatewayTracks, apiTracks);
		expect(ids(out)[0]).toBe("136340808");
	});

	test("does not list the same track twice", () => {
		const out = ids(rankMixedTracks("Auli'i Cravalho How Far I'll Go", gatewayTracks, apiTracks));
		expect(out.filter((id) => id === "136340812")).toHaveLength(1);
		expect(new Set(out).size).toBe(out.length);
	});

	test("keeps gateway-shaped items as they were, so the page can still show them", () => {
		const out = rankMixedTracks("Auli'i Cravalho How Far I'll Go", gatewayTracks, apiTracks);
		const reprise = out.find((t) => String(t.SNG_ID ?? t.id) === "136340812");
		expect(reprise.SNG_TITLE).toBe("How Far I'll Go");
	});

	test("karaoke and key-shifted tracks end up last", () => {
		const out = ids(rankMixedTracks("Auli'i Cravalho How Far I'll Go", gatewayTracks, apiTracks));
		const karaoke = ["1434887672", "1434887702", "3890762711"];
		for (const k of karaoke) expect(out.indexOf(k)).toBeGreaterThan(out.indexOf("140977801"));
	});

	test("with only the title typed, Deezer's own order is kept among exact matches", () => {
		const out = ids(rankMixedTracks("How Far I'll Go", [], apiTracks));
		expect(out[0]).toBe("136340808");
		expect(out.indexOf("136340808")).toBeLessThan(out.indexOf("140977801"));
	});

	test("a harmless label like (From \"Movie\"/Soundtrack Version) ties with the plain title", () => {
		const real = gw("1", "He Mele No Lilo", '(From "Lilo & Stitch"/Soundtrack Version)', "Mark Keali'i Ho'omalu", "Lilo & Stitch");
		const cover = gw("2", "He Mele No Lilo", "", "Gameloft", "x");
		const out = ids(rankMixedTracks("He Mele No Lilo", [real], [cover]));
		expect(out).toEqual(["1", "2"]); // kept in Deezer's order, not pushed below the cover
	});

	test("works with no extra tracks", () => {
		expect(rankMixedTracks("x", gatewayTracks, [])).toHaveLength(gatewayTracks.length);
	});
});

describe("readTrackForRank", () => {
	test("joins the gateway version label to the title", () => {
		expect(readTrackForRank(gatewayTracks[0]).title).toBe("How Far I'll Go (Reprise)");
	});
	test("does not repeat a version that is already in the title", () => {
		expect(readTrackForRank({ SNG_TITLE: "Song (Live)", VERSION: "(Live)" }).title).toBe("Song (Live)");
	});
	test("reads the public API shape", () => {
		const r = readTrackForRank(apiTracks[0]);
		expect(r.artist).toBe(cravalho);
	});
});
