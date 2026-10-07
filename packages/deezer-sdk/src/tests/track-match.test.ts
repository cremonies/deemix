import { describe, expect, test } from "vitest";
import {
	baseForQuery,
	needsContributorLookup,
	normalize,
	pickBest,
	queryValue,
	splitTitle,
	type CandidateTrack,
	type WantedTrack,
} from "../track-match.js";

const cravalho = { id: 11389676, name: "Auli'i Cravalho" };

const moana: WantedTrack = {
	artist: "Auli'i Cravalho",
	title: "How Far I'll Go",
	album: "Moana (Original Motion Picture Soundtrack/Deluxe Edition)",
};

const moanaOriginal: CandidateTrack = {
	id: 136340808,
	title: "How Far I'll Go",
	artist: cravalho,
	album: { title: "Moana (Original Motion Picture Soundtrack/Deluxe Edition)" },
};

// Real results from Deezer (October 2026) for track:"How Far I'll Go".
const moanaResults: CandidateTrack[] = [
	{ id: 140977801, title: "How Far I'll Go", artist: { name: "daigoro789" } },
	moanaOriginal,
	{
		id: 136340812,
		title: "How Far I'll Go (Reprise)",
		artist: cravalho,
		album: { title: "Moana (Original Motion Picture Soundtrack/Deluxe Edition)" },
	},
	{ id: 136340826, title: "How Far I'll Go (Alessia Cara Version)", artist: { name: "Alessia Cara" } },
	{ id: 4294716442, title: "How Far I'll Go", artist: { name: "Bongo Cat" } },
];

// Real results from the plain "artist title" query, where the original is absent.
const moanaPlainResults: CandidateTrack[] = [
	{ id: 136340812, title: "How Far I'll Go (Reprise)", artist: cravalho },
	{
		id: 1434887672,
		title: "How Far I'll Go (原曲歌手:Auli'i Cravalho)",
		artist: { name: "歌っちゃ王" },
	},
	{
		id: 3890762711,
		title: "How Far I'll Go (Originally Performed by Auli'i Cravalho) (Karaoke Version)",
		artist: { name: "karaoke SESH" },
	},
];

describe("pickBest", () => {
	test("finds the original, not the Reprise or covers", () => {
		expect(pickBest(moana, moanaResults)?.candidate.id).toBe(136340808);
	});

	test("returns null when only the Reprise and karaoke versions are present", () => {
		expect(pickBest(moana, moanaPlainResults)).toBeNull();
	});

	test("ignores straight vs curly apostrophes", () => {
		const wanted = { ...moana, title: "How Far I’ll Go", artist: "Auli’i Cravalho" };
		expect(pickBest(wanted, moanaResults)?.candidate.id).toBe(136340808);
	});

	test("accepts a featuring suffix the wanted title lacks", () => {
		const wanted: WantedTrack = { artist: "Daft Punk", title: "Get Lucky" };
		const results: CandidateTrack[] = [
			{ id: 1, title: "Get Lucky (Backing Track Minus Vocals)", artist: { name: "Zoom Entertainments Limited" } },
			{ id: 2, title: "Get Lucky", artist: { name: "Vitamin String Quartet" } },
			{ id: 3, title: "Get Lucky (Originally performed by Daft Punk)", artist: { name: "Lowland" } },
			{
				id: 4,
				title: "Get Lucky (feat. Pharrell Williams and Nile Rodgers)",
				artist: { name: "Daft Punk" },
				album: { title: "Random Access Memories" },
			},
		];
		expect(pickBest(wanted, results)?.candidate.id).toBe(4);
	});

	test("matches accents and punctuation in artist names", () => {
		const wanted: WantedTrack = { artist: "Beyoncé", title: "Halo" };
		const results: CandidateTrack[] = [{ id: 9, title: "Halo", artist: { name: "Beyonce" } }];
		expect(pickBest(wanted, results)?.candidate.id).toBe(9);
	});

	test("penalizes karaoke even when credited to the wanted artist", () => {
		const wanted: WantedTrack = { artist: "Beyoncé", title: "Halo" };
		const results: CandidateTrack[] = [
			{ id: 1, title: "Halo (Karaoke Version)", artist: { name: "Beyoncé" } },
		];
		expect(pickBest(wanted, results)).toBeNull();
	});

	test("does not accept a tribute act whose name merely contains the artist", () => {
		const wanted: WantedTrack = { artist: "Daft Punk", title: "Get Lucky" };
		const results: CandidateTrack[] = [
			{ id: 1819285597, title: "Get Lucky", artist: { name: "Daft Punk Experience" }, album: { title: "Get Lucky" } },
		];
		expect(pickBest(wanted, results)).toBeNull();
	});

	test("never accepts a track by an unrelated artist", () => {
		const wanted: WantedTrack = { artist: "Oasis", title: "Wonderwall" };
		const results: CandidateTrack[] = [{ id: 5, title: "Wonderwall", artist: { name: "Ryan Adams" } }];
		expect(pickBest(wanted, results)).toBeNull();
	});

	test("keeps an explicit version when the wanted title has it", () => {
		const wanted: WantedTrack = { artist: "Beyoncé", title: "Halo (Live)" };
		const results: CandidateTrack[] = [
			{ id: 1, title: "Halo", artist: { name: "Beyoncé" } },
			{ id: 2, title: "Halo (Live)", artist: { name: "Beyoncé" } },
		];
		expect(pickBest(wanted, results)?.candidate.id).toBe(2);
	});

	test("matches on a contributor credit", () => {
		const wanted: WantedTrack = { artist: "Disney", title: "How Far I'll Go" };
		const original: CandidateTrack = {
			...moanaOriginal,
			contributors: [cravalho, { id: 9219, name: "Disney" }],
		};
		expect(pickBest(wanted, [original])?.candidate.id).toBe(136340808);
		expect(pickBest(wanted, [moanaOriginal])).toBeNull();
	});

	test("matches on artist id when the name differs", () => {
		const wanted: WantedTrack = { artist: "A. Cravalho", title: "How Far I'll Go", artistId: 11389676 };
		expect(pickBest(wanted, moanaResults)?.candidate.id).toBe(136340808);
	});
});

describe("needsContributorLookup", () => {
	test("offers title matches without karaoke noise, capped", () => {
		const out = needsContributorLookup({ artist: "Disney", title: "How Far I'll Go" }, [
			...moanaPlainResults,
			...moanaResults,
		]);
		expect(out.map((c) => c.id)).toContain(136340808);
		expect(out.map((c) => c.id)).not.toContain(3890762711);
		expect(out.length).toBeLessThanOrEqual(8);
	});
});

describe("string helpers", () => {
	test("normalize", () => {
		expect(normalize("  Beyoncé ’Halo’ ")).toBe("beyonce halo");
	});

	test("splitTitle", () => {
		expect(splitTitle("Get Lucky (feat. X) - Radio Edit")).toEqual({
			base: "get lucky",
			suffixes: ["feat x", "radio edit"],
		});
	});

	test("baseForQuery and queryValue strip quotes and versions", () => {
		expect(baseForQuery('How Far I\'ll Go (From "Moana")')).toBe("How Far I'll Go");
		expect(queryValue('say "hi"')).toBe("say hi");
	});
});
