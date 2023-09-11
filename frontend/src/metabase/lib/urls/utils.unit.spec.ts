import MetabaseSettings from "metabase/lib/settings";
import * as utils from "./utils";

describe("URL utils", () => {
  describe("trimLastSlash", () => {
    it("should remove slashes at the end of a string", () => {
      expect(utils.trimLastSlash("http://metabase.com")).toBe(
        "http://metabase.com",
      );
      expect(utils.trimLastSlash("http://metabase.com/")).toBe(
        "http://metabase.com",
      );
      expect(utils.trimLastSlash("http://metabase.com/subpath")).toBe(
        "http://metabase.com/subpath",
      );
      expect(utils.trimLastSlash("http://metabase.com/subpath/")).toBe(
        "http://metabase.com/subpath",
      );
      expect(utils.trimLastSlash("http://metabase.com/subpath//")).toBe(
        "http://metabase.com/subpath",
      );
      expect(utils.trimLastSlash("/api/card/3")).toBe("/api/card/3");
      expect(utils.trimLastSlash("/api/card/3/")).toBe("/api/card/3");
    });
  });

  describe("isSubpath", () => {
    it("should return true if the path is a subpath", () => {
      expect(utils.isSubpath("http://metabase.com/subpath")).toBe(true);
      expect(utils.isSubpath("http://metabase.com/subpath/")).toBe(true);
    });
    it("should return false if the path is not a subpath", () => {
      expect(utils.isSubpath("http://metabase.com")).toBe(false);
      expect(utils.isSubpath("http://metabase.com/")).toBe(false);
    });
  });

  describe("getURLIncludingSubpath", () => {
    it("should return the path with subpath", () => {
      jest
        .spyOn(MetabaseSettings, "get")
        .mockReturnValue("http://metabase.com/subpath/");

      expect(utils.getURLIncludingSubpath("/api/card/3")).toBe(
        "http://metabase.com/subpath/api/card/3",
      );
    });

    it("should return the path without subpath", () => {
      jest
        .spyOn(MetabaseSettings, "get")
        .mockReturnValue("http://metabase.com");

      expect(utils.getURLIncludingSubpath("/api/card/3")).toBe("/api/card/3");
    });
  });
});
