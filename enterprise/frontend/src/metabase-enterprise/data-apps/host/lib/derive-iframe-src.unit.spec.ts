import { setBasename } from "metabase/utils/basename";
import { DATA_APP_IFRAME_LOCALE_HASH_KEY } from "metabase-enterprise/data-apps/constants";

import { deriveIframeSrc } from "./derive-iframe-src";

const setup = (parentPath: string, name: string) => {
  window.history.replaceState({}, "", parentPath);

  return { src: deriveIframeSrc(name, null) };
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

  describe("cross-origin (MB_ISOLATED_ORIGIN set)", () => {
    it("serves from the isolated origin and carries the host origin in the broker hash", () => {
      window.history.replaceState({}, "", "/apps/sales/orders/42");
      expect(deriveIframeSrc("sales", "https://apps.example.com")).toBe(
        "https://apps.example.com/embed/apps/sales/orders/42#__mb_broker=" +
          encodeURIComponent(window.location.origin),
      );
    });

    it("passes the user's locale, which the isolated origin can't learn without a signed-in user", () => {
      window.MetabaseLocales = { user: "de", site: "en" };
      window.history.replaceState({}, "", "/apps/sales");
      try {
        const src = new URL(
          deriveIframeSrc("sales", "https://apps.example.com"),
        );
        const hash = new URLSearchParams(src.hash.slice(1));
        expect(hash.get(DATA_APP_IFRAME_LOCALE_HASH_KEY)).toBe("de");
      } finally {
        delete window.MetabaseLocales;
      }
    });

    it("stays same-origin without an isolated origin", () => {
      window.history.replaceState({}, "", "/apps/sales");
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
