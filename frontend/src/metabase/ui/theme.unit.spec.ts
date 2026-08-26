import { rem } from "@mantine/core";

import { getThemeOverrides } from "metabase/ui/theme";

const SHADOW_SCALE_KEYS = [
  "xs",
  "xs_outline",
  "sm",
  "sm_outline",
  "lg_outline",
];

const LIGHT_SHADOWS = {
  xs: "0 1px 3px 0 rgba(0, 0, 0, 0.07)",
  xs_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.07), 0 1px 3px 0 rgba(0, 0, 0, 0.07)",
  sm: "0 1px 4px 0 rgba(0, 0, 0, 0.05), 0 5px 15px 0 rgba(0, 0, 0, 0.10)",
  sm_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.07), 0 1px 4px 0 rgba(0, 0, 0, 0.05), 0 5px 15px 0 rgba(0, 0, 0, 0.10)",
  lg_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.07), 0 5px 15px 0 rgba(0, 0, 0, 0.15), 0 30px 60px 0 rgba(0, 0, 0, 0.20)",
};

const DARK_SHADOWS = {
  xs: "0 1px 3px 0 rgba(0, 0, 0, 0.20)",
  xs_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.15), 0 1px 3px 0 rgba(0, 0, 0, 0.20)",
  sm: "0 1px 4px 0 rgba(0, 0, 0, 0.07), 0 5px 15px 0 rgba(0, 0, 0, 0.20)",
  sm_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.15), 0 1px 4px 0 rgba(0, 0, 0, 0.07), 0 5px 15px 0 rgba(0, 0, 0, 0.20)",
  lg_outline:
    "0 0 0 0.5px rgba(0, 0, 0, 0.15), 0 5px 15px 0 rgba(0, 0, 0, 0.20), 0 30px 60px 0 rgba(0, 0, 0, 0.40)",
};

const SPACING_SCALE = {
  none: rem(0),
  xxxs: rem(2),
  xxs: rem(4),
  xs: rem(6),
  sm: rem(8),
  md: rem(12),
  lg: rem(16),
  xl: rem(24),
  xxl: rem(32),
  xxxl: rem(40),
};

const RADIUS_SCALE = {
  none: "0px",
  xxxs: "2px",
  xxs: "4px",
  xs: "6px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
};

// Style props whose bare-word values must resolve to a theme scale key.
// Component `size` props intentionally excluded: they use Mantine's own
// size scale, not the spacing/radius/shadow scales.
const SCALE_PROPS_TO_SCALES = {
  radius: Object.keys(RADIUS_SCALE),
  shadow: SHADOW_SCALE_KEYS,
  padding: Object.keys(SPACING_SCALE),
  p: Object.keys(SPACING_SCALE),
  px: Object.keys(SPACING_SCALE),
  py: Object.keys(SPACING_SCALE),
  pt: Object.keys(SPACING_SCALE),
  pb: Object.keys(SPACING_SCALE),
  pl: Object.keys(SPACING_SCALE),
  pr: Object.keys(SPACING_SCALE),
  m: Object.keys(SPACING_SCALE),
  mx: Object.keys(SPACING_SCALE),
  my: Object.keys(SPACING_SCALE),
  mt: Object.keys(SPACING_SCALE),
  mb: Object.keys(SPACING_SCALE),
  ml: Object.keys(SPACING_SCALE),
  mr: Object.keys(SPACING_SCALE),
  gap: Object.keys(SPACING_SCALE),
  gutter: Object.keys(SPACING_SCALE),
  spacing: Object.keys(SPACING_SCALE),
} as const;

type ExtendedComponentTheme = {
  defaultProps?: Record<string, unknown>;
  styles?: Record<string, Record<string, unknown>>;
};

const getExtendedComponentTheme = (
  component: unknown,
): ExtendedComponentTheme => {
  // Mantine extended components expose these fields as statics, but the public
  // theme type treats component entries as opaque configuration values.
  return component as ExtendedComponentTheme;
};

const isBareWord = (value: string) => /^[a-z_]+$/.test(value);

describe("theme scales (GDGT-2486)", () => {
  describe("spacing", () => {
    it("maps each spacing key to its design-system value", () => {
      expect(getThemeOverrides().spacing).toEqual(SPACING_SCALE);
    });
  });

  describe("radius", () => {
    it("maps each radius key to its design-system value", () => {
      expect(getThemeOverrides().radius).toEqual(RADIUS_SCALE);
    });

    it("defaults to 6px", () => {
      const { defaultRadius, radius } = getThemeOverrides();
      expect(defaultRadius).toBe("xs");
      expect(radius?.xs).toBe("6px");
    });
  });

  describe("shadows", () => {
    it.each([
      ["light", LIGHT_SHADOWS],
      ["dark", DARK_SHADOWS],
    ] as const)("maps every elevation in %s mode", (colorScheme, expected) => {
      expect(getThemeOverrides(colorScheme).shadows).toEqual(expected);
    });

    it("uses a stronger shadow set in dark mode", () => {
      const light = getThemeOverrides("light").shadows ?? {};
      const dark = getThemeOverrides("dark").shadows ?? {};

      for (const key of SHADOW_SCALE_KEYS) {
        expect(dark[key]).not.toEqual(light[key]);
      }
    });

    it("does not depend on whitelabel colors", () => {
      const plain = getThemeOverrides("light");
      const whitelabeled = getThemeOverrides("light", {});

      expect(whitelabeled.spacing).toEqual(plain.spacing);
      expect(whitelabeled.radius).toEqual(plain.radius);
      expect(whitelabeled.shadows).toEqual(plain.shadows);
    });

    it("returns independent mutable scale objects", () => {
      const first = getThemeOverrides();
      const second = getThemeOverrides();

      expect(first.spacing).not.toBe(second.spacing);
      expect(first.radius).not.toBe(second.radius);
      expect(first.shadows).not.toBe(second.shadows);
    });
  });

  describe("component defaults", () => {
    it("resolves every scale-based component default to a defined key", () => {
      const components = getThemeOverrides("dark").components ?? {};
      const violations: string[] = [];

      for (const [componentName, component] of Object.entries(components)) {
        const defaultProps = getExtendedComponentTheme(component).defaultProps;
        if (!defaultProps) {
          continue;
        }

        for (const [prop, value] of Object.entries(defaultProps)) {
          const scaleKeys =
            // Object.entries types keys as string; narrow to the known prop map.
            SCALE_PROPS_TO_SCALES[prop as keyof typeof SCALE_PROPS_TO_SCALES];

          // Bare-word values are scale tokens and must exist in the scale.
          // Raw CSS values (e.g. `1.5rem`, `0 2px 4px black`) are allowed.
          if (!scaleKeys || typeof value !== "string" || !isBareWord(value)) {
            continue;
          }

          if (!scaleKeys.includes(value)) {
            violations.push(
              `${componentName} default "${prop}: ${value}" is not a key of the ${prop} scale`,
            );
          }
        }
      }

      expect(violations).toEqual([]);
    });

    it("preserves Mantine defaults affected by the spacing scale", () => {
      const components = getThemeOverrides().components ?? {};
      const expectedDefaults = {
        Card: { padding: "lg" },
        Grid: { gutter: "lg" },
        Group: { gap: "lg" },
        SimpleGrid: { spacing: "lg" },
        Stack: { gap: "lg" },
      };

      for (const [componentName, expectedProps] of Object.entries(
        expectedDefaults,
      )) {
        const component = components[componentName];
        expect(getExtendedComponentTheme(component).defaultProps).toMatchObject(
          expectedProps,
        );
      }

      for (const componentName of [
        "DateInput",
        "DatePicker",
        "DateTimePicker",
        "MonthPicker",
      ]) {
        expect(
          getExtendedComponentTheme(components[componentName]).styles,
        ).toMatchObject({
          levelsGroup: {
            gap: "var(--mantine-spacing-lg)",
          },
        });
      }
    });
  });
});
