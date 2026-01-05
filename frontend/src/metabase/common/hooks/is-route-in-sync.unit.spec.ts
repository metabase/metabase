import { isRouteInSync } from "./is-route-in-sync";

describe("isRouteInSync", () => {
  beforeEach(() => {
    delete (window as any).overrideIsWithinIframe;
  });

  describe("in an iframe", () => {
    beforeEach(() => {
      (window as any).overrideIsWithinIframe = true;
    });

    it("should return true when the current pathname matches the location pathname", () => {
      window.history.pushState({}, "", "/some/path");
      const result = isRouteInSync("/some/path");

      expect(result).toBe(true);
    });

    it("should return false when the current pathname does not match the location pathname", () => {
      window.history.pushState({}, "", "/some/other-path");
      const result = isRouteInSync("/some/path");

      expect(result).toBe(false);
    });
  });

  describe("not in an iframe", () => {
    it("should return true when the current pathname matches the location pathname", () => {
      window.history.pushState({}, "", "/some/path");
      const result = isRouteInSync("/some/path");

      expect(result).toBe(true);
    });

    it("should return true too when the current pathname does not match the location pathname, to preserve existing behavior", () => {
      window.history.pushState({}, "", "/some/other-path");
      const result = isRouteInSync("/some/path");

      expect(result).toBe(true);
    });
  });
});
