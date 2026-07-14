import "metabase/api";

import { createMockEntitiesState } from "__support__/store";
import * as runRtkEndpointModule from "metabase/api/utils/run-rtk-endpoint";
import * as questionsActions from "metabase/questions/actions";
import * as cardsModule from "metabase/redux/cards";
import type { Dispatch, GetState } from "metabase/redux/store";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import registerVisualizations from "metabase/visualizations/register";
import type { Card } from "metabase-types/api";
import {
  createSampleDatabase,
  createSavedNativeCard,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import * as analytics from "../../analytics";
import * as querying from "../querying";

import { apiCreateQuestion, apiUpdateQuestion, revertToRevision } from "./core";

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

describe("QB Actions > apiUpdateQuestion (rerun-on-save, metabase#30165)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setup(card: Card) {
    const dispatch = jest.fn().mockReturnValue({ mock: "mock" });
    const entities = createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    });

    const question = getMetadata(createMockState({ entities })).question(
      card.id,
    );
    expect(question).toBeDefined();

    // lastRunCard is null, so the current question is dirty relative to the
    // (absent) last run — apiUpdateQuestion sees isResultDirty === true.
    const qb = createMockQueryBuilderState({ card });
    const getState = () => ({ ...createMockState(), entities, qb });

    jest.spyOn(cardsModule, "updateQuestionCard");
    const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");

    return { question, dispatch, getState, runQuestionQuerySpy };
  }

  it("does not auto-run a dirty native question after saving (metabase#30165)", async () => {
    const { question, dispatch, getState, runQuestionQuerySpy } = setup(
      createSavedNativeCard(),
    );

    await apiUpdateQuestion(question!)(dispatch, getState);

    expect(runQuestionQuerySpy).not.toHaveBeenCalled();
  });

  it("auto-runs a dirty structured question after saving", async () => {
    const { question, dispatch, getState, runQuestionQuerySpy } = setup(
      createSavedStructuredCard(),
    );

    await apiUpdateQuestion(question!)(dispatch, getState);

    expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
  });
});

describe("QB Actions > apiCreateQuestion", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("loads metadata for the newly created model so it can be filtered (metabase#28971)", async () => {
    // A freshly created model has no field metadata in the store yet, so the UI
    // can't build a filter against it. The thunk must load metadata for the
    // created card before returning; otherwise filtering a new model is broken.
    const inputCard = createSavedStructuredCard({ type: "model" });
    const createdCard = createSavedStructuredCard({ id: 999, type: "model" });

    const entities = createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [inputCard],
    });
    const question = getMetadata(createMockState({ entities })).question(
      inputCard.id,
    );
    expect(question).toBeDefined();

    const loadMetadataSpy = jest
      .spyOn(questionsActions, "loadMetadataForCard")
      .mockReturnValue(
        (async () => undefined) as unknown as ReturnType<
          typeof questionsActions.loadMetadataForCard
        >,
      );
    jest
      .spyOn(querying, "runQuestionQuery")
      .mockReturnValue((() => {}) as unknown as ReturnType<
        typeof querying.runQuestionQuery
      >);
    jest.spyOn(analytics, "trackNewQuestionSaved").mockImplementation(() => {});

    // The first (and only) thunk dispatched is createQuestionCard, which resolves
    // to the freshly persisted card; other dispatches receive plain actions.
    const dispatch = jest.fn((action) =>
      typeof action === "function" ? Promise.resolve(createdCard) : action,
    );
    const getState = () => ({ ...createMockState(), entities });

    await apiCreateQuestion(question!)(
      dispatch as unknown as Dispatch,
      getState as unknown as GetState,
    );

    expect(loadMetadataSpy).toHaveBeenCalledTimes(1);
    expect(loadMetadataSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: createdCard.id }),
    );
  });
});
