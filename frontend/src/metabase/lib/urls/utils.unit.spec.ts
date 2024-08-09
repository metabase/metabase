import api from "metabase/lib/api";

import { getSubpathSafeUrl, openInNewTab } from "./utils";

const fakeBasename = "foobar";
const originalBasename = api.basename;

const mockWindowOpen = jest.spyOn(window, "open").mockImplementation();

describe("utils", () => {
  beforeEach(() => {
    api.basename = fakeBasename;
  });

  afterEach(() => {
    api.basename = originalBasename;
    mockWindowOpen.mockClear();
  });

  describe("getSubpathSafeUrl", () => {
    it("should return undefined if url is undefined", () => {
      expect(getSubpathSafeUrl()).toBeUndefined();
    });

    it("should return basename if url is empty string", () => {
      expect(getSubpathSafeUrl("")).toBe(fakeBasename);
      expect(getSubpathSafeUrl("  ")).toBe(fakeBasename);
    });

    it("should return subpath-safe url", () => {
      expect(getSubpathSafeUrl("/baz")).toBe(`${fakeBasename}/baz`);
    });
  });

  describe("openInNewTab", () => {
    it("should return undefined if url is undefined", () => {
      expect(openInNewTab()).toBeUndefined();
    });

    it("should return undefined if url is empty string", () => {
      expect(openInNewTab("")).toBeUndefined();
      expect(openInNewTab("  ")).toBeUndefined();
    });

    it("should dasdas", () => {
      openInNewTab("/baz");

      expect(mockWindowOpen).toHaveBeenCalledTimes(1);
      expect(mockWindowOpen).toHaveBeenCalledWith("/baz", "_blank");
    });
  });
});
