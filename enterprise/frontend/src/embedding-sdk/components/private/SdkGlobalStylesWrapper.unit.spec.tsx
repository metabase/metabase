import { renderWithProviders, screen } from "__support__/ui";
import { SdkGlobalStylesWrapper } from "embedding-sdk/components/private/SdkGlobalStylesWrapper";
import { SdkThemeProvider } from "embedding-sdk/components/private/SdkThemeProvider";
import { Text } from "metabase/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

describe("SdkGlobalStylesWrapper", () => {
  it("injects the font-face declaration when available", () => {
    const state = createMockState({
      settings: createMockSettingsState({
        "application-font-files": [
          {
            src: "https://example.com/foo.woff2",
            fontFormat: "woff2",
            fontWeight: 700,
          },
        ],
      }),
    });

    renderWithProviders(<SdkGlobalStylesWrapper />, {
      storeInitialState: state,
    });

    const rules = Array.from(document.styleSheets).flatMap(sheet =>
      Array.from(sheet.cssRules || []),
    );

    const fontFaceRule = rules.find(
      rule =>
        rule.constructor.name === "CSSFontFaceRule" &&
        rule.cssText.includes("foo.woff2"),
    )!;

    expect(fontFaceRule).toBeDefined();
    expect(fontFaceRule.cssText).toContain("font-weight: 700");
  });

  // TODO: Add substitute tests since we can't test CSS custom properties with JSDom
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip("should use foreground color from the theme", () => {
    const theme = {
      colors: { "text-primary": "rgb(255, 0, 255)" },
    };

    renderWithProviders(
      <SdkThemeProvider theme={theme}>
        <SdkGlobalStylesWrapper>
          <Text>Hello world</Text>
        </SdkGlobalStylesWrapper>
      </SdkThemeProvider>,
    );

    expect(window.getComputedStyle(screen.getByText("Hello world")).color).toBe(
      "rgb(255, 0, 255)",
    );
  });
});
