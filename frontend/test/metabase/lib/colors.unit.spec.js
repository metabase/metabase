import { getRandomColor, normal } from "metabase/lib/colors";

describe("getRandomColor", () => {
  it("should return a color string from the proper family", () => {
    const color = getRandomColor(normal);
    expect(Object.values(normal)).toContain(color);
  });
});
