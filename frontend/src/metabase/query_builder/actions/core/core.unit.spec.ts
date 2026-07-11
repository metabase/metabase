import "metabase/api";

import { createMockEntitiesState } from "__support__/store";
import * as runRtkEndpointModule from "metabase/api/utils/run-rtk-endpoint";
import * as cardsModule from "metabase/redux/cards";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import registerVisualizations from "metabase/visualizations/register";
import type { Card } from "metabase-types/api";
import {
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import * as querying from "../querying";

import { apiUpdateQuestion, revertToRevision } from "./core";

registerVisualizations();

describe("QB Actions > revertToRevision", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("re-runs the question query after reverting to a revision (metabase#45926)", async () => {
    // reverting only swaps out the card definition; without an explicit query
    // re-run the visualization keeps showing stale results until a manual
    // refresh. Guard that the thunk re-runs the query itself.
    jest
      .spyOn(runRtkEndpointModule, "runRtkEndpoint")
      .mockResolvedValue({ id: 1 });
    const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");

    const dispatch = jest.fn();
    const getState = jest.fn();

    await revertToRevision(1, { id: 42 })(dispatch, getState);

    expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
    expect(runQuestionQuerySpy).toHaveBeenCalledWith({
      shouldUpdateUrl: false,
    });
  });
});

describe("QB Actions > apiUpdateQuestion", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setup(cardOverrides: Partial<Card>) {
    const card = createSavedStructuredCard({
      visualization_settings: { "graph.dimensions": ["CREATED_AT"] },
      ...cardOverrides,
    });

    const dispatch = jest.fn().mockReturnValue({ mock: "mock" });
    const entities = createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    });

    const question = getMetadata(createMockState({ entities })).question(
      card.id,
    );
    expect(question).toBeDefined();

    const qb = createMockQueryBuilderState({ card });
    const getState = () => ({ ...createMockState(), entities, qb });

    const updateSpy = jest.spyOn(cardsModule, "updateQuestionCard");

    return { question, dispatch, getState, updateSpy };
  }

  it("does not save visualization_settings when updating a metric (metabase#44171)", async () => {
    const { question, dispatch, getState, updateSpy } = setup({
      type: "metric",
    });

    await apiUpdateQuestion(question!)(dispatch, getState);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [request] = updateSpy.mock.calls[0];
    expect(request).not.toHaveProperty("visualization_settings");
  });

  it("saves visualization_settings when updating a regular question", async () => {
    const { question, dispatch, getState, updateSpy } = setup({
      type: "question",
    });

    await apiUpdateQuestion(question!)(dispatch, getState);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [request] = updateSpy.mock.calls[0];
    expect(request).toHaveProperty("visualization_settings");
  });
});
