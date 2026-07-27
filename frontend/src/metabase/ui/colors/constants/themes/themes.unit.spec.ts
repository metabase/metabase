import { METABASE_DARK_THEME } from "./dark";
import { METABASE_LIGHT_THEME } from "./light";

// `color-mix` is only resolvable by a browser, so static viz (which renders on
// the server) fails on any color that uses it. Whitelabel colors are the one
// exception: their value isn't known until runtime, so they can't be collapsed
// into a literal.
const WHITELABEL_COLOR_VARIABLES = [
  "--mb-color-core-brand",
  "--mb-color-core-filter",
  "--mb-color-core-summarize",
];

const isWhitelabelDerived = (value: string) =>
  WHITELABEL_COLOR_VARIABLES.some((variable) => value.includes(variable));

describe.each([
  ["light", METABASE_LIGHT_THEME],
  ["dark", METABASE_DARK_THEME],
])("%s theme", (_name, theme) => {
  it("should not use `color-mix` outside of whitelabel-derived colors", () => {
    const offenders = Object.entries(theme.colors ?? {})
      .filter(
        ([, value]) =>
          typeof value === "string" &&
          value.includes("color-mix") &&
          !isWhitelabelDerived(value),
      )
      .map(([key]) => key);

    expect(offenders).toEqual([]);
  });
});
