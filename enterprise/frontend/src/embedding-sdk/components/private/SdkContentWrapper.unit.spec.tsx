import { renderWithProviders } from "__support__/ui";
import { SdkContentWrapper } from "embedding-sdk/components/private/SdkContentWrapper";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

describe("SdkContentWrapper", () => {
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

    renderWithProviders(<SdkContentWrapper />, { storeInitialState: state });

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
});
