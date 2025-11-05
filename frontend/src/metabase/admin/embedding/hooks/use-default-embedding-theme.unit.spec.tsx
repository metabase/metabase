import { renderHookWithProviders } from "__support__/ui";
import { getColors } from "metabase/lib/colors";
import type { ColorSettings } from "metabase-types/api/settings";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { useDefaultEmbeddingTheme } from "./use-default-embedding-theme";

const setup = (applicationColors?: ColorSettings) => {
  const initialState = createMockState({
    settings: { values: { "application-colors": applicationColors } },
  } as Partial<State>);

  return renderHookWithProviders(() => useDefaultEmbeddingTheme(), {
    storeInitialState: initialState,
  });
};

describe("useDefaultEmbeddingTheme", () => {
  it("default colors should match lib/colors/colors.ts", () => {
    const { result } = setup();
    const theme = result.current;
    const expectedColors = getColors();

    expect(theme?.colors?.brand).toBe(expectedColors.brand);
    expect(theme?.colors?.["text-secondary"]).toBe(
      expectedColors["text-secondary"],
    );

    // The SDK maps background-secondary as [bg-medium, bg-secondary]
    // It should use the first defined value which is "bg-medium"
    expect(theme?.colors?.["background-secondary"]).toBe(
      expectedColors["bg-medium"],
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
