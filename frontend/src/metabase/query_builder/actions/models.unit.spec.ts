import { createMockEntitiesState } from "__support__/store";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import registerVisualizations from "metabase/visualizations/register";
import {
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import * as core from "./core";
import { turnQuestionIntoModel } from "./models";

registerVisualizations();

function setup() {
  const card = createSavedStructuredCard();

  const dispatch = jest.fn().mockReturnValue({ mock: "mock" });

  const entities = createMockEntitiesState({
    databases: [createSampleDatabase()],
    questions: [card],
  });

  // sanity check that our state produces a real question at the seam
  const metadata = getMetadata(createMockState({ entities }));
  expect(metadata.question(card.id)).toBeDefined();

  const qb = createMockQueryBuilderState({ card });
  const getState = () => ({ ...createMockState(), entities, qb });

  return { card, dispatch, getState };
}

describe("QB Actions > turnQuestionIntoModel", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("saves the current question as a model and reruns the query in a single update", async () => {
    const apiUpdateQuestionSpy = jest
      .spyOn(core, "apiUpdateQuestion")
      .mockReturnValue((() => Promise.resolve()) as any);

    const { dispatch, getState } = setup();

    await turnQuestionIntoModel()(dispatch, getState);

    // The fix for metabase#47940 replaced a multi-step conversion (which read
    // stale metadata from the store and dropped column coercions) with a single
    // `apiUpdateQuestion(model, { rerunQuery: true })` call that keeps the live
    // question's metadata.
    expect(apiUpdateQuestionSpy).toHaveBeenCalledTimes(1);

    const [model, options] = apiUpdateQuestionSpy.mock.calls[0];
    expect(model.type()).toBe("model");
    expect(model.display()).toBe("table");
    expect(model.card().collection_position).toBe(1);
    expect(model.settings()).toEqual({});
    expect(options).toEqual({ rerunQuery: true });
  });
});
