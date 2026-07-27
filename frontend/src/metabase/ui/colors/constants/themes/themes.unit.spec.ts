import { METABASE_DARK_THEME } from "./dark";
import { METABASE_LIGHT_THEME } from "./light";

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
  ["light", METABASE_LIGHT_THEME],
  ["dark", METABASE_DARK_THEME],
])("%s theme", (_name, theme) => {
  const staticColors = Object.entries(theme.colors ?? {}).filter(
    ([, value]) => !isWhitelabelDerived(value),
  );

  it("should define every non-whitelabel color as a literal value", () => {
    const offenders = staticColors
      .filter(([, value]) => !LITERAL_COLOR.test(value))
      .map(([key, value]) => `${key}: ${value}`);

    expect(offenders).toEqual([]);
  });
});
