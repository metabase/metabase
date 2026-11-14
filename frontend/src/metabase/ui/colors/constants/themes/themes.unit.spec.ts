import { getDarkTheme } from "./dark";
import { getLightTheme } from "./light";

// Static viz renders on the server and feeds every theme color straight into
// the `color` library, which only parses literals. Anything the browser would
// have to resolve — `color-mix` or `var()` throws there, so theme definitions have to
// reference the underlying value directly.
//
// Whitelabel colors are the one exception: they aren't known until runtime, so
// colors deriving from them have to stay dynamic.
const WHITELABEL_COLOR_KEYS = ["core-brand", "core-filter", "core-summarize"];

const LITERAL_COLOR = /^hsla\([^()]*\)$/;

const isWhitelabelDerived = (value: string) =>
  WHITELABEL_COLOR_KEYS.some((key) => value.includes(`var(--mb-color-${key})`));

describe.each([
  ["light", getLightTheme()],
  ["dark", getDarkTheme()],
])("%s theme", (_name, theme) => {
  it("should define every non-whitelabel color as a literal value", () => {
    const offenders = Object.entries(theme.colors)
      .filter(([, value]) => !isWhitelabelDerived(value))
      .filter(([, value]) => !LITERAL_COLOR.test(value))
      .map(([key, value]) => `${key}: ${value}`);

    expect(offenders).toEqual([]);
  });
});

describe("light theme", () => {
  // Trashed items in collection tables use this color for their icons.
  it("should resolve text-disabled to the translucent dark shade", () => {
    // Same color as rgba(7, 23, 34, 0.44).
    expect(getLightTheme().colors["text-disabled"]).toBe(
      "hsla(204, 66%, 8%, 0.44)",
    );
  });
});
