// Live checks against api.deezer.com (like api.test.ts). Slow: ~5 requests per song.
import { describe, expect, test } from "vitest";
import { Deezer } from "../deezer.js";
import { normalize, splitTitle } from "../track-match.js";

const dz = new Deezer();

interface Case {
	artist: string;
	title: string;
	album: string;
}

const cases: Case[] = [
	{ artist: "Auli'i Cravalho", title: "How Far I'll Go", album: "Moana (Original Motion Picture Soundtrack/Deluxe Edition)" },
	{ artist: "Alessia Cara", title: "Scars To Your Beautiful", album: "Know-It-All" },
	{ artist: "Daft Punk", title: "Get Lucky", album: "Random Access Memories" },
	{ artist: "Beyoncé", title: "Halo", album: "I Am... Sasha Fierce" },
	{ artist: "Guns N' Roses", title: "Sweet Child O' Mine", album: "Appetite For Destruction" },
	{ artist: "Oasis", title: "Don't Look Back In Anger", album: "(What's the Story) Morning Glory?" },
	{ artist: "Calvin Harris", title: "This Is What You Came For", album: "This Is What You Came For" },
	{ artist: "Taylor Swift", title: "Love Story", album: "Fearless" },
	// Spotify-style metadata: curly apostrophes, version suffixes, wrong album wording
	{ artist: "Auli’i Cravalho", title: "How Far I’ll Go", album: "Some Album That Does Not Exist" },
	{ artist: "Daft Punk", title: "Get Lucky (feat. Pharrell Williams & Nile Rodgers) - Radio Edit", album: "Get Lucky" },
];

describe("get_track_id_from_metadata (live)", () => {
	for (const c of cases) {
		test(`${c.artist} - ${c.title}`, async () => {
			const id = await dz.api.get_track_id_from_metadata(c.artist, c.title, c.album);
			expect(id).not.toBe("0");

			const track: any = await dz.api.call(`track/${id}`);
			const gotTitle = splitTitle(track.title).base;
			const wantTitle = splitTitle(c.title).base;
			// eslint-disable-next-line no-console
			console.log(`${c.artist} - ${c.title}  =>  ${id}  ${track.artist.name} - ${track.title} [${track.album.title}]`);
			expect(gotTitle).toBe(wantTitle);
			expect(normalize(track.artist.name)).toContain(normalize(c.artist).split(" ")[0]);
		}, 60_000);
	}

	// Album unknown: undefined, empty string, or missing argument.
	for (const c of cases.slice(0, 8)) {
		test(`no album: ${c.artist} - ${c.title}`, async () => {
			const id = await dz.api.get_track_id_from_metadata(c.artist, c.title);
			expect(id).not.toBe("0");

			const track: any = await dz.api.call(`track/${id}`);
			// eslint-disable-next-line no-console
			console.log(`[no album] ${c.artist} - ${c.title}  =>  ${id}  ${track.artist.name} - ${track.title} [${track.album.title}]`);
			expect(splitTitle(track.title).base).toBe(splitTitle(c.title).base);
			expect(normalize(track.artist.name)).toContain(normalize(c.artist).split(" ")[0]);
		}, 60_000);
	}

	test("empty-string and undefined album behave the same", async () => {
		const a = await dz.api.get_track_id_from_metadata("Auli'i Cravalho", "How Far I'll Go", "");
		const b = await dz.api.get_track_id_from_metadata("Auli'i Cravalho", "How Far I'll Go", undefined);
		expect(Number(a)).toBe(136340808);
		expect(Number(b)).toBe(136340808);
	}, 60_000);

	test("Moana original is returned by id", async () => {
		const id = await dz.api.get_track_id_from_metadata(
			"Auli'i Cravalho",
			"How Far I'll Go",
			"Moana (Original Motion Picture Soundtrack/Deluxe Edition)"
		);
		expect(Number(id)).toBe(136340808);
	}, 60_000);

	test("returns \"0\" for a song that does not exist", async () => {
		const id = await dz.api.get_track_id_from_metadata("Zxqv Nonexistent Band", "Qwertyuiop Asdfghjkl Song", "Nope");
		expect(id).toBe("0");
	}, 60_000);
});
