import { ICON_PATHS, loadIcon, parseViewBox } from "metabase/icon_paths";

// find the first icon with a non standard viewBox
const NON_STANDARD_VIEWBOX_ICON = Object.keys(ICON_PATHS).filter(key => {
  if (ICON_PATHS[key].attrs && ICON_PATHS[key].attrs.viewBox) {
    return ICON_PATHS[key];
  }
})[0];

describe("Icon", () => {
  describe("parseViewBox", () => {
    it("should return the proper values from a viewBox", () => {
      const value = 32;
      const viewBox = `0 0 ${value} ${value}`;

      expect(parseViewBox(viewBox)).toEqual([value, value]);
    });
  });

  describe("loadIcon", () => {
    it("should properly set a width and height based on the viewbox", () => {
      const def = loadIcon(NON_STANDARD_VIEWBOX_ICON);
      const { width, height, viewBox } = def.attrs;
      const [parsedWidth, parsedHeight] = parseViewBox(viewBox);

      expect(width).toEqual(parsedWidth / 2);
      expect(height).toEqual(parsedHeight / 2);
    });
  });
});
