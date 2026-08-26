import { L, loadDraw } from "./index";

describe("metabase/leaflet", () => {
  it("exports a working leaflet", () => {
    expect(L).toBeDefined();
    expect(typeof L.map).toBe("function");
  });

  it("attaches the draw members to L once loadDraw resolves", async () => {
    await loadDraw();

    expect(L.Draw).toBeDefined();
    expect(L.Draw.Rectangle).toBeDefined();
  });
});
