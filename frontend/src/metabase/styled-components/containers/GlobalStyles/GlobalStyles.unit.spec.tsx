import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";

import { GlobalStyles } from "./GlobalStyles";

const getGlobalStyleText = () =>
  Array.from(document.querySelectorAll("style[data-global-style-sheet]"))
    .map((style) => style.textContent)
    .join("\n");

describe("GlobalStyles", () => {
  it("does not point font urls at lowercased site url path", () => {
    renderWithProviders(<GlobalStyles />, {
      storeInitialState: createMockState({
        settings: mockSettings({
          "site-url": "https://example.com/CAPITALS.Analytics",
        }),
      }),
    });

    expect(getGlobalStyleText()).not.toContain("capitals.analytics");
  });
});
