import { renderHookWithProviders } from "__support__/ui";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import { getColors } from "metabase/ui/colors/colors";
import type { ColorSettings } from "metabase-types/api/settings";

import { useDefaultEmbeddingThemeSettings } from "./use-default-embedding-theme-settings";

const setup = (applicationColors?: ColorSettings) => {
  // Unjustified type cast. FIXME
  const initialState = createMockState({
    settings: { values: { "application-colors": applicationColors } },
  } as Partial<State>);

  return renderHookWithProviders(() => useDefaultEmbeddingThemeSettings(), {
    storeInitialState: initialState,
  });
};

describe("useDefaultEmbeddingThemeSettings", () => {
  it("default colors should match lib/colors/colors.ts", () => {
    const { result } = setup();
    const theme = result.current;
    const expectedColors = getColors();

    expect(theme?.colors?.brand).toBe(expectedColors["core-brand"]);
    expect(theme?.colors?.["text-secondary"]).toBe(
      expectedColors["text-secondary"],
    );

    // The SDK maps the public `background-secondary` key as
    // [background_page-secondary, background_page-tertiary]; it should use the
    // first defined value.
    expect(theme?.colors?.["background-secondary"]).toBe(
      expectedColors["background_page-secondary"],
    );
  });

  it("should use application colors when provided", () => {
    const { result } = setup({ brand: "#FF5733", filter: "#2D2D30" });
    const theme = result.current;

    expect(theme?.colors?.brand).toBe("#FF5733");
    expect(theme?.colors?.filter).toBe("#2D2D30");
  });

  it("should use white-labeled chart colors when provided", () => {
    const { result } = setup({ accent0: "#FF0000", accent7: "#0000FF" });
    const theme = result.current;

    expect(theme?.colors?.charts?.[0]).toBe("#FF0000");
    expect(theme?.colors?.charts?.[7]).toBe("#0000FF");
  });
});
