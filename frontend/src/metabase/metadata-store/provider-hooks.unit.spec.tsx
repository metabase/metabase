import { createMockSettingsState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderHookWithProviders } from "__support__/ui";
import { createMockCard, createMockSettings } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import {
  useQuestionFromCard,
  useQuestionFromCardBuilder,
  useQuestionFromOptsBuilder,
} from "./provider";

const storeInitialState = {
  entities: createMockEntitiesState({ databases: [createSampleDatabase()] }),
  settings: createMockSettingsState(createMockSettings()),
};

describe("the question builder hooks", () => {
  it.each([
    ["useQuestionFromCardBuilder", useQuestionFromCardBuilder],
    ["useQuestionFromOptsBuilder", useQuestionFromOptsBuilder],
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

describe("useQuestionFromCard", () => {
  it("returns a question that survives a re-render", () => {
    const card = createMockCard({ id: 1 });
    const { result, rerender } = renderHookWithProviders(
      () => useQuestionFromCard(card),
      { storeInitialState },
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
    expect(first.id()).toBe(1);
  });

  it("returns undefined without a card", () => {
    const { result } = renderHookWithProviders(
      () => useQuestionFromCard(undefined),
      { storeInitialState },
    );

    expect(result.current).toBeUndefined();
  });
});
