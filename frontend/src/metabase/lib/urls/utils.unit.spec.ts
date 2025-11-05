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
    it("should return basename if url is an empty string", () => {
      expect(getSubpathSafeUrl("")).toBe(fakeBasename);
    });

    it("should return subpath-safe url", () => {
      expect(getSubpathSafeUrl("/baz")).toBe(`${fakeBasename}/baz`);
    });

    it("should return subpath-safe url if url does not have leading `/` character", () => {
      expect(getSubpathSafeUrl("baz")).toBe(`${fakeBasename}/baz`);
    });

    it("should return original url if `api.basename ` is empty", () => {
      api.basename = "";

      expect(getSubpathSafeUrl("baz")).toBe("baz");
    });
  });

  describe("openInNewTab", () => {
    it.each(["", "/", "/baz"])(
      "should open the provided link in a new tab",
      (url) => {
        openInNewTab(url);

        expect(mockWindowOpen).toHaveBeenCalledTimes(1);
        expect(mockWindowOpen).toHaveBeenCalledWith(url, "_blank");
      },
    );
  });
});
