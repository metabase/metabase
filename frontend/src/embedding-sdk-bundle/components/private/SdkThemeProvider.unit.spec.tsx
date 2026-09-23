import { waitFor } from "@testing-library/react";
import { useEffect } from "react";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { SdkThemeProvider } from "embedding-sdk-bundle/components/private/SdkThemeProvider";
import { DEFAULT_FONT } from "embedding-sdk-bundle/config";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { getMetabaseSdkCssVariables } from "metabase/styled-components/theme/css-variables";
import { useMantineTheme } from "metabase/ui";
import { getDarkTheme, getLightTheme } from "metabase/ui/colors";
import { getBaseColorsForThemeDefinitionOnly } from "metabase/ui/colors/constants/base-colors";

const EXAMPLE_COLOR = "background_page-primary-inverse";

const LIGHT_EXAMPLE_VALUE = getLightTheme().colors[EXAMPLE_COLOR];
const DARK_EXAMPLE_VALUE = getDarkTheme().colors[EXAMPLE_COLOR];

const THEME_CASES = [
  // V1 themes
  {
    themeName: "V1 light theme",
    theme: {
      colors: {
        background: "#ffffff",
        "text-primary": "#111111",
      },
    },
    expectedColor: LIGHT_EXAMPLE_VALUE,
    unexpectedColor: DARK_EXAMPLE_VALUE,
  },
  {
    themeName: "V1 dark theme",
    theme: {
      colors: {
        background: "#111111",
        "text-primary": "#ffffff",
      },
    },
    expectedColor: DARK_EXAMPLE_VALUE,
    unexpectedColor: LIGHT_EXAMPLE_VALUE,
  },

  // V2 themes
  {
    themeName: "V2 dark theme",
    theme: {
      version: 2 as const,
      colors: {
        "background_page-primary": "#111111",
        "text-primary": "#ffffff",
      },
    },
    expectedColor: DARK_EXAMPLE_VALUE,
    unexpectedColor: LIGHT_EXAMPLE_VALUE,
  },
];

const SdkCssVariablesTester = ({
  onChange,
}: {
  onChange: (cssVariables: string) => void;
}) => {
  const theme = useMantineTheme();

  useEffect(() => {
    onChange(getMetabaseSdkCssVariables({ theme, font: DEFAULT_FONT }).styles);
  }, [onChange, theme]);

  return null;
};

const renderSdkThemeProvider = (
  theme: React.ComponentProps<typeof SdkThemeProvider>["theme"],
  onCssVariablesChange: (cssVariables: string) => void,
  whitelabelColors?: Record<string, string>,
) =>
  renderWithProviders(
    <SdkThemeProvider theme={theme}>
      <div className="mb-wrapper">SDK content</div>
      <SdkCssVariablesTester onChange={onCssVariablesChange} />
    </SdkThemeProvider>,
    whitelabelColors && {
      storeInitialState: createMockState({
        settings: mockSettings({ "application-colors": whitelabelColors }),
      }),
    },
  );

// Emmited styles can contain redefinition of same variable with different value, so we can't rely on simple
// `.toContain` checks, instead we need to extract last definition which is what would be actually applied by browser
const getLastCssVariableValue = (cssVariables: string, variable: string) =>
  [...cssVariables.matchAll(new RegExp(`${variable}:\\s*([^;]+);`, "g"))]
    .at(-1)
    ?.at(1)
    ?.trim();

describe("SdkThemeProvider", () => {
  beforeEach(() => {
    ensureMetabaseProviderPropsStore().cleanup();
  });

  it("themes all mapped background colors from the V1 background color", async () => {
    const handleCssVariablesChange = jest.fn();

    renderSdkThemeProvider(
      { colors: { background: "#123456" } },
      handleCssVariablesChange,
    );

    await waitFor(() => {
      expect(handleCssVariablesChange.mock.lastCall?.[0]).toContain(
        "--mb-color-background_surface-primary: #123456",
      );
    });

    expect(handleCssVariablesChange.mock.lastCall?.[0]).toContain(
      "--mb-color-background-primary: #123456",
    );
    expect(handleCssVariablesChange.mock.lastCall?.[0]).toContain(
      "--mb-color-background_page-primary: #123456",
    );
  });

  describe("brand ramp", () => {
    const { ocean } = getBaseColorsForThemeDefinitionOnly();

    // Light defines `text-hover`/`text-brand` off brand[60]/[50], dark off brand[30]/[40]
    const LIGHT_OCEAN = { textHover: ocean[60], textBrand: ocean[50] };
    const DARK_OCEAN = { textHover: ocean[30], textBrand: ocean[40] };

    // We need to check what was actually injected into page, thus
    // direct query (unlike other tests that use SdkCssVariablesTester)
    const emittedStyles = () =>
      // eslint-disable-next-line testing-library/no-node-access -- emotion writes these <style> tags; there is no Testing Library query for them
      [...document.querySelectorAll("style")]
        .map((element) => element.textContent ?? "")
        .join("\n");

    const setup = async (
      theme: React.ComponentProps<typeof SdkThemeProvider>["theme"],
      whitelabelColors?: Record<string, string>,
    ) => {
      renderSdkThemeProvider(theme, jest.fn(), whitelabelColors);

      await waitFor(() =>
        expect(emittedStyles()).toContain("--mb-color-text-brand:"),
      );

      return (variable: string) =>
        getLastCssVariableValue(emittedStyles(), variable);
    };

    it.each([
      ["a V1 theme", { colors: { brand: "#DF75E9" } }],
      ["a V2 theme", { version: 2 as const, colors: { brand: "#DF75E9" } }],
      [
        "a dark V1 theme",
        { preset: "dark" as const, colors: { brand: "#DF75E9" } },
      ],
    ])("tracks a brand color from %s", async (_name, theme) => {
      const cssVariable = await setup(theme);

      expect(cssVariable("--mb-color-core-brand")).toBe("#DF75E9");
      expect(cssVariable("--mb-color-text-hover")).toContain(
        "var(--mb-color-core-brand)",
      );
      expect(cssVariable("--mb-color-text-brand-hover")).toContain(
        "var(--mb-color-core-brand)",
      );
      expect(cssVariable("--mb-color-text-brand")).toContain(
        "var(--mb-color-core-brand)",
      );
    });

    it.each([
      ["no theme", undefined],
      [
        "a theme that sets a different color",
        { colors: { border: "#3B3F3F" } },
      ],
    ])("tracks a whitelabel brand color given %s", async (_name, theme) => {
      const cssVariable = await setup(theme, { brand: "#DF75E9" });

      expect(cssVariable("--mb-color-text-hover")).toContain(
        "var(--mb-color-core-brand)",
      );
      expect(cssVariable("--mb-color-text-brand")).toContain(
        "var(--mb-color-core-brand)",
      );
    });

    it("keeps the SDK theme brand when whitelabel also sets one", async () => {
      const cssVariable = await setup(
        { colors: { brand: "#DF75E9" } },
        {
          brand: "#00FF00",
        },
      );

      expect(cssVariable("--mb-color-core-brand")).toBe("#DF75E9");
      expect(cssVariable("--mb-color-text-brand")).toContain(
        "var(--mb-color-core-brand)",
      );
    });

    it.each([
      ["no theme", undefined, LIGHT_OCEAN],
      [
        "a V1 theme without a brand",
        { colors: { "text-primary": "#111111" } },
        LIGHT_OCEAN,
      ],
      [
        "a V2 theme without a brand",
        { version: 2 as const, colors: { "text-primary": "#111111" } },
        LIGHT_OCEAN,
      ],
      ["a dark theme without a brand", { preset: "dark" as const }, DARK_OCEAN],
    ])(
      "replaces the brand ramp with Ocean given %s",
      async (_name, theme, expected) => {
        const cssVariable = await setup(theme);

        expect(cssVariable("--mb-color-text-hover")).toBe(expected.textHover);
        expect(cssVariable("--mb-color-text-brand")).toBe(expected.textBrand);
      },
    );
  });

  it.each(THEME_CASES)(
    "$themeName base color variables are color scheme dependent",
    async ({ theme, expectedColor, unexpectedColor }) => {
      const handleCssVariablesChange = jest.fn();

      renderSdkThemeProvider(theme, handleCssVariablesChange);

      await waitFor(() => {
        const cssVariableKey = `--mb-color-${EXAMPLE_COLOR}`;
        const cssVariables = handleCssVariablesChange.mock.lastCall?.[0] ?? "";

        // This CSS variable is generated by createColorVars from the selected base
        // Metabase theme. Their light and dark mode values differ, so we can verify which
        // color scheme `getMetabaseSdkCssVariables` chose from the resolved palette.
        expect(cssVariables).toContain(`${cssVariableKey}: ${expectedColor}`);

        expect(cssVariables).not.toContain(
          `${cssVariableKey}: ${unexpectedColor}`,
        );
      });
    },
  );
});
