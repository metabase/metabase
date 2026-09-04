import { readFileSync } from "fs";

import { rem } from "@mantine/core";

import { getThemeOverrides } from "metabase/ui/theme";

const SHADOW_SCALE_KEYS = [
  "xs",
  "xs_outline",
  "sm",
  "sm_outline",
  "lg_outline",
];

// Keep expected values independent from the production scale definitions so
// these tests catch accidental changes to the theme.
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
  xxxs: rem(2),
  xxs: rem(4),
  xs: rem(6),
  sm: rem(8),
  md: rem(12),
  lg: rem(16),
  xl: rem(24),
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
  classNames?: Record<string, unknown>;
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

describe("theme scales", () => {
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
      expect(radius?.xs).toBe(rem(6));
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
  });

  describe("shared behavior", () => {
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

    it("assigns expected component elevations", () => {
      const components = getThemeOverrides().components ?? {};
      const expectedShadowDefaults = {
        Card: "xs",
        Combobox: "xs",
        Dialog: "sm_outline",
        DrawerRoot: "xs_outline",
        Menu: "sm_outline",
        ModalRoot: "lg_outline",
        Paper: "xs_outline",
        Popover: "sm_outline",
      };

      for (const [componentName, shadow] of Object.entries(
        expectedShadowDefaults,
      )) {
        expect(
          getExtendedComponentTheme(components[componentName]).defaultProps,
        ).toMatchObject({ shadow });
      }

      const expectedCssElevations = [
        {
          componentName: "ActionIcon",
          slot: "root",
          file: "frontend/src/metabase/ui/components/buttons/ActionIcon/ActionIcon.module.css",
          selector: '.root[data-variant="filled"]',
          shadow: "xs",
        },
        {
          componentName: "Button",
          slot: "root",
          file: "frontend/src/metabase/ui/components/buttons/Button/Button.module.css",
          selector: '.root[data-variant="filled"]',
          shadow: "xs",
        },
        {
          componentName: "Alert",
          slot: "root",
          file: "frontend/src/metabase/ui/components/feedback/Alert/Alert.module.css",
          selector: ".root",
          shadow: "xs",
        },
        {
          componentName: "Notification",
          slot: "root",
          file: "frontend/src/metabase/ui/components/feedback/Notification/Notification.module.css",
          selector: ".root",
          shadow: "sm",
        },
        {
          componentName: "CheckboxCard",
          slot: "card",
          file: "frontend/src/metabase/ui/components/inputs/Checkbox/Checkbox.module.css",
          selector: ".card",
          shadow: "xs",
        },
        {
          componentName: "NativeSelect",
          slot: "input",
          file: "frontend/src/metabase/ui/components/inputs/NativeSelect/NativeSelect.module.css",
          selector: ".input",
          shadow: "xs",
        },
        {
          componentName: "Pill",
          slot: "root",
          file: "frontend/src/metabase/ui/components/inputs/Pill/Pill.module.css",
          selector: ".root",
          shadow: "xs_outline",
        },
        {
          componentName: "RadioCard",
          slot: "card",
          file: "frontend/src/metabase/ui/components/inputs/Radio/Radio.module.css",
          selector: ".card",
          shadow: "xs",
        },
        {
          componentName: "SegmentedControl",
          slot: "root",
          file: "frontend/src/metabase/ui/components/inputs/SegmentedControl/SegmentedControl.module.css",
          selector: ".SegmentedControl",
          shadow: "xs_outline",
        },
        {
          componentName: "Switch",
          slot: "thumb",
          file: "frontend/src/metabase/ui/components/inputs/Switch/Switch.module.css",
          selector: ".thumb",
          shadow: "sm_outline",
        },
        {
          componentName: "Tooltip",
          slot: "tooltip",
          file: "frontend/src/metabase/ui/components/overlays/Tooltip/Tooltip.module.css",
          selector: ".tooltip",
          shadow: "sm",
        },
        {
          file: "frontend/src/metabase/common/components/Toaster/Toaster.module.css",
          selector: ".toast",
          shadow: "sm",
        },
      ];

      const expectedClassNameSlots = expectedCssElevations.flatMap(
        ({ componentName, slot }) =>
          componentName && slot ? [{ componentName, slot }] : [],
      );

      for (const { componentName, slot } of expectedClassNameSlots) {
        expect(
          getExtendedComponentTheme(components[componentName]).classNames,
        ).toHaveProperty(slot);
      }

      for (const { file, selector, shadow } of expectedCssElevations) {
        const css = readFileSync(file, "utf8");
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const blockStart = css.search(
          new RegExp(`^${escapedSelector} \\{`, "m"),
        );
        const blockEnd = css.indexOf("}", blockStart);
        const declaration = `box-shadow: var(--mantine-shadow-${shadow})`;
        const declarationIndex = css.indexOf(declaration, blockStart);

        expect(blockStart).toBeGreaterThanOrEqual(0);
        expect(declarationIndex).toBeGreaterThan(blockStart);
        expect(declarationIndex).toBeLessThan(blockEnd);
      }
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
