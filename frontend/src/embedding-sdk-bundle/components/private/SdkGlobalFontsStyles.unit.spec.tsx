import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";

import { SdkFontsGlobalStyles } from "./SdkGlobalFontsStyles";

const FONT_FILES = [
  {
    src: "https://fonts.example.com/inter-regular.woff2",
    fontWeight: 400,
    fontFormat: "woff2",
  },
  {
    src: "https://fonts.example.com/inter-bold.woff2",
    fontWeight: 700,
    fontFormat: "woff2",
  },
] as const;

describe("SdkFontsGlobalStyles", () => {
  it("declares a font face for every custom font file", () => {
    renderWithProviders(<SdkFontsGlobalStyles />, {
      storeInitialState: createMockState({
        settings: mockSettings({ "application-font-files": [...FONT_FILES] }),
      }),
    });

    const rules = Array.from(
      document.head.querySelectorAll<HTMLStyleElement>(
        "style[data-global-style-sheet]",
      ),
    ).flatMap((sheet) => Array.from(sheet.sheet?.cssRules ?? []));
    const fontFaces = rules.filter((rule) =>
      rule.cssText.startsWith("@font-face"),
    );

    expect(fontFaces).toHaveLength(FONT_FILES.length);
  });
});
