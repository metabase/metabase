import { setBasename } from "metabase/utils/basename";

import { deriveIframeSrc } from "./derive-iframe-src";

const setup = (parentPath: string, name: string) => {
  window.history.replaceState({}, "", parentPath);

  return { src: deriveIframeSrc(name) };
};

describe("deriveIframeSrc", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it.each<[string, string, string]>([
    ["/apps/sales", "sales", "/embed/apps/sales"],
    ["/apps/sales/orders/42", "sales", "/embed/apps/sales/orders/42"],
    ["/somewhere/else", "sales", "/embed/apps/sales"],
    ["/apps/my%20app/page", "my app", "/embed/apps/my%20app/page"],
  ])(
    "maps parent %p (name %p) to iframe src %p",
    (parentPath, name, expected) => {
      expect(setup(parentPath, name).src).toBe(expected);
    },
  );

  describe("cross-origin (MB_DATA_APPS_HOST set)", () => {
    it("serves from the apps origin and carries the host origin in the broker hash", () => {
      window.history.replaceState({}, "", "/apps/sales/orders/42");
      expect(deriveIframeSrc("sales", "https://apps.example.com")).toBe(
        "https://apps.example.com/embed/apps/sales/orders/42#__mb_broker=" +
          encodeURIComponent(window.location.origin),
      );
    });

    it("uses only the origin of the configured apps host", () => {
      window.history.replaceState({}, "", "/apps/sales");
      expect(deriveIframeSrc("sales", "https://apps.example.com/ignored")).toBe(
        "https://apps.example.com/embed/apps/sales#__mb_broker=" +
          encodeURIComponent(window.location.origin),
      );
    });

    it("a blank or null apps host stays same-origin", () => {
      window.history.replaceState({}, "", "/apps/sales");
      expect(deriveIframeSrc("sales", "")).toBe("/embed/apps/sales");
      expect(deriveIframeSrc("sales", null)).toBe("/embed/apps/sales");
    });

    it("carries the instance basename on a subpath deployment", () => {
      setBasename("/analytics");
      window.history.replaceState({}, "", "/analytics/apps/sales");
      try {
        expect(deriveIframeSrc("sales", "https://apps.example.com")).toBe(
          "https://apps.example.com/analytics/embed/apps/sales#__mb_broker=" +
            encodeURIComponent(window.location.origin),
        );
      } finally {
        setBasename("");
      }
    });
  });
});
