import { getRelativeLandingPageUrl } from "./utils";

describe("utils", () => {
  describe("getRelativeLandingPageUrl", () => {
    it("should return relative url for valid inputs", () => {
      [
        ["", ""],
        ["/", "/"],
        ["/test", "/test"],
        ["/one/two/three", "/one/two/three"],
        ["/trailing/slash/", "/trailing/slash/"],
        ["no-leading-slash", "/no-leading-slash"],
        ["/pathname?query=param#hash", "/pathname?query=param#hash"],
        ["#hash", "/#hash"],
        ["http://localhost/absolute/same-origin", "/absolute/same-origin"],
      ].forEach(([input, relativeUrl]) => {
        expect(getRelativeLandingPageUrl(input)).toStrictEqual({
          isSameOrigin: true,
          relativeUrl,
        });
      });
    });

    it("should not return relativeUrl for invalid inputs", () => {
      [
        "https://google.com",
        "sms://?&body=Hello",
        "https://localhost/test",
        "mailto:user@example.com",
        "file:///path/to/resource",
      ].forEach(input => {
        expect(getRelativeLandingPageUrl(input)).toStrictEqual({
          isSameOrigin: false,
          relativeUrl: "",
        });
      });
    });
  });
});
