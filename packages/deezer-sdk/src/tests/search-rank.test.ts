import { describe, expect, test } from "vitest";
import {
	rankSearchResults,
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
