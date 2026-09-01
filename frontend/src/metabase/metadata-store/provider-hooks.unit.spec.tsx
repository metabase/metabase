import { createMockEntitiesState } from "__support__/store";
import { renderHookWithProviders } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import { createMockSettings } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { useQuestionFromCard, useQuestionFromOpts } from "./provider";

const storeInitialState = {
  entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  settings: createMockSettingsState(createMockSettings()),
};

describe("the question hooks", () => {
  it.each([
    ["useQuestionFromCard", useQuestionFromCard],
    ["useQuestionFromOpts", useQuestionFromOpts],
  ])("%s returns a builder that survives a re-render", (_name, useHook) => {
    const { result, rerender } = renderHookWithProviders(() => useHook(), {
      storeInitialState,
    });
    const first = result.current;

    rerender();

    // A dependency array holding this must not change on every render.
    expect(result.current === first).toBe(true);
  });
});
