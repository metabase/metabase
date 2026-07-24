import { createColorGetter } from "./colors";

// Every color token referenced by static-viz components (grep `getColor(`).
const STATIC_VIZ_TOKENS = [
  "accent1",
  "background_page-primary",
  "background_page-tertiary",
  "background_page-tertiary-inverse",
  "border",
  "border-neutral",
  "core-white",
  "text-disabled",
  "text-primary",
  "text-secondary",
];

describe("createColorGetter", () => {
  const getColor = createColorGetter();

  it.each(STATIC_VIZ_TOKENS)(
    "should return a parseable hex value for %s",
    (token) => {
      expect(getColor(token)).toMatch(/^#[0-9A-F]{6,8}$/i);
    },
  );

  it("should not throw for theme tokens defined as CSS expressions like color-mix()", () => {
    // background_page-tertiary-inverse is defined in the theme as
    // `color-mix(in srgb, hsla(204, 66%, 8%, 1), black 50%)`, which the
    // static-viz color parser cannot parse. It crashed gauge chart rendering
    // in dashboard subscriptions (metabase#77566).
    expect(() => getColor("background_page-tertiary-inverse")).not.toThrow();
  });
});
