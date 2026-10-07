// Live check against api.deezer.com.
import { describe, expect, test } from "vitest";
import { Deezer } from "../deezer.js";

const dz = new Deezer();

const cases: { query: string; first: number }[] = [
	{ query: "Auli'i Cravalho How Far I'll Go", first: 136340808 },
	{ query: "Taylor Swift Love Story", first: 602091402 },
	{ query: "Alessia Cara Scars To Your Beautiful", first: 120739016 },
	{ query: "Auli'i Cravalho How Far I'll Go reprise", first: 136340812 },
];

describe("search_track_smart (live)", () => {
	for (const c of cases) {
		test(c.query, async () => {
			const res: any = await dz.api.search_track_smart(c.query, { limit: 25 });
			expect(res.data[0].id).toBe(c.first);
		});
	}

	test("later pages are returned unchanged", async () => {
		const plain: any = await dz.api.search_track("Taylor Swift Love Story", { limit: 5, index: 5 });
		const smart: any = await dz.api.search_track_smart("Taylor Swift Love Story", { limit: 5, index: 5 });
		expect(smart.data.map((t: any) => t.id)).toEqual(plain.data.map((t: any) => t.id));
	});
});
