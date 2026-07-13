// Characterization test for the navigation PRODUCER seam.
//
// This pins updateUrl -> dispatch(push/replace, { ..., state }), the QB side that
// decides which router action to emit and what card state to carry on it. It is a
// lock-down net for the upcoming react-router migration and is complementary to
// redux/routing-contract.unit.spec.ts, which pins the transport side (how the
// dispatched push/replace action mutates state.routing).

import { createMockEntitiesState } from "__support__/store";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  ORDERS_ID,
  createSampleDatabase,
  createSavedStructuredCard,
  createStructuredModelCard,
} from "metabase-types/api/mocks/presets";

import { getTableUrlForPristineQuestion } from "../utils";

import { SET_CURRENT_STATE } from "./state";
import { updateUrl } from "./url";

registerVisualizations();

const CALL_HISTORY_METHOD = "@@router/CALL_HISTORY_METHOD";

type UpdateUrlOptions = Parameters<typeof updateUrl>[1];

function buildSavedQuestion(card: Card): Question {
  const entities = createMockEntitiesState({
    databases: [createSampleDatabase()],
    questions: [card],
  });
  const metadata = getMetadata(createMockState({ entities }));
  return checkNotNull(metadata.question(card.id));
}

function buildPristineTableQuestion(): Question {
  const entities = createMockEntitiesState({
    databases: [createSampleDatabase()],
  });
  const metadata = getMetadata(createMockState({ entities }));
  return checkNotNull(metadata.table(ORDERS_ID)).newQuestion();
}

function getDispatchedNavigation(dispatch: jest.Mock) {
  const call = dispatch.mock.calls.find(
    ([action]) => action?.type === CALL_HISTORY_METHOD,
  );
  if (!call) {
    return null;
  }
  const { method, args } = call[0].payload;
  return { method, descriptor: args[0] };
}

function dispatchedSetCurrentState(dispatch: jest.Mock) {
  return dispatch.mock.calls.find(
    ([action]) => action?.type === SET_CURRENT_STATE,
  );
}

type SetupOpts = {
  question: Question;
  options?: UpdateUrlOptions;
  currentState?: { card: Card; cardId?: number; serializedCard: string } | null;
  originalCard?: Card | null;
  isModifiedFromNotebook?: boolean;
};

async function setup({
  question,
  options = {},
  currentState = null,
  originalCard = null,
  isModifiedFromNotebook = false,
}: SetupOpts) {
  const dispatch = jest.fn();
  const qb = createMockQueryBuilderState({
    card: question.card(),
    originalCard,
    currentState,
    uiControls: createMockQueryBuilderUIControlsState({
      queryBuilderMode: "view",
      isModifiedFromNotebook,
    }),
  });
  const getState = () => ({
    ...createMockState(),
    qb,
  });

  await updateUrl(question, options)(dispatch, getState);

  return { dispatch };
}

describe("QB Actions > updateUrl (navigation producer contract)", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("carries the serialized card on location.state (back/forward restore contract)", async () => {
    const card = createSavedStructuredCard();
    const question = buildSavedQuestion(card);

    const { dispatch } = await setup({
      question,
      options: { dirty: true, replaceState: false },
    });

    const navigation = getDispatchedNavigation(dispatch);
    expect(navigation).not.toBeNull();
    expect(navigation?.descriptor.state).toEqual({
      card: question.card(),
      cardId: question.id(),
      objectId: undefined,
    });
  });

  describe("push vs replace decision", () => {
    it("replaces when replaceState is undefined, the card is unchanged and the mode is unchanged", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      const { dispatch } = await setup({
        question,
        options: { dirty: false },
        currentState: { card: question.card(), serializedCard: "" },
      });

      expect(getDispatchedNavigation(dispatch)?.method).toBe("replace");
    });

    it("forces replace when replaceState is explicitly true", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      const { dispatch } = await setup({
        question,
        options: { dirty: true, replaceState: true },
      });

      expect(getDispatchedNavigation(dispatch)?.method).toBe("replace");
    });

    it("forces push when replaceState is explicitly false", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      const { dispatch } = await setup({
        question,
        options: { dirty: false, replaceState: false },
        currentState: { card: question.card(), serializedCard: "" },
      });

      expect(getDispatchedNavigation(dispatch)?.method).toBe("push");
    });
  });

  it("short-circuits (no navigation, no setCurrentState) when the card and URL are both unchanged", async () => {
    const card = createSavedStructuredCard();
    const question = buildSavedQuestion(card);

    // First run: observe the descriptor the question produces.
    const first = await setup({
      question,
      options: { dirty: false },
    });
    const descriptor = getDispatchedNavigation(first.dispatch)?.descriptor;
    expect(descriptor).toBeDefined();

    // Align window.location with the descriptor so isSameURL becomes true, and
    // set currentState.card to the same card so isSameCard becomes true.
    const search = descriptor.search ?? "";
    const hash = descriptor.hash ?? "";
    window.history.replaceState(
      {},
      "",
      `${descriptor.pathname}${search}${hash}`,
    );

    const { dispatch } = await setup({
      question,
      options: { dirty: false },
      currentState: { card: question.card(), serializedCard: "" },
    });

    expect(getDispatchedNavigation(dispatch)).toBeNull();
    expect(dispatchedSetCurrentState(dispatch)).toBeUndefined();
  });

  describe("preserveNavbarState", () => {
    it("merges preserveNavbarState into location.state on the replace path", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      const { dispatch } = await setup({
        question,
        options: { dirty: true, replaceState: true, preserveNavbarState: true },
      });

      const navigation = getDispatchedNavigation(dispatch);
      expect(navigation?.method).toBe("replace");
      expect(navigation?.descriptor.state).toEqual({
        card: question.card(),
        cardId: question.id(),
        objectId: undefined,
        preserveNavbarState: true,
      });
    });

    it("does not add preserveNavbarState on the push path", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      const { dispatch } = await setup({
        question,
        options: {
          dirty: true,
          replaceState: false,
          preserveNavbarState: true,
        },
      });

      const navigation = getDispatchedNavigation(dispatch);
      expect(navigation?.method).toBe("push");
      expect(navigation?.descriptor.state).not.toHaveProperty(
        "preserveNavbarState",
      );
    });
  });

  // Witness for metabase#56775: when navigating an ad-hoc model/metric (the QB
  // composes a model into an ad-hoc question whose source is the model itself),
  // the card carried on location.state must be the UNWRAPPED underlying model
  // card, not the composed ad-hoc wrapper. Otherwise the back button restores a
  // card whose source-table is `card__<id>` (the model wrapping itself) instead
  // of the model's real query.
  it("carries the unwrapped model card (not the composed ad-hoc card) for an ad-hoc model (metabase#56775)", async () => {
    // Defaults to a structured model over ORDERS (source-table = ORDERS_ID).
    const modelCard = createStructuredModelCard({ id: 1 });
    const entities = createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [modelCard],
    });
    const baseState = createMockState({ entities });
    const metadata = getMetadata(baseState);
    const modelQuestion = checkNotNull(metadata.question(modelCard.id));
    // This is what getQuestion produces when opening a model: an ad-hoc question
    // whose query reads FROM the model (source-card = the model itself).
    const adHocModelQuestion = modelQuestion.composeQuestion();

    // Sanity: composing rewrites the query to read FROM the model, so the
    // composed card's query no longer equals the model's real query.
    expect(adHocModelQuestion.card().dataset_query).not.toEqual(
      modelCard.dataset_query,
    );

    const dispatch = jest.fn();
    const qb = createMockQueryBuilderState({
      // qb.card / originalCard hold the real (unwrapped) model card.
      card: modelCard,
      originalCard: modelCard,
      currentState: null,
      uiControls: createMockQueryBuilderUIControlsState({
        queryBuilderMode: "view",
      }),
    });
    const getState = () => ({ ...baseState, qb });

    await updateUrl(adHocModelQuestion, { dirty: true, replaceState: false })(
      dispatch,
      getState,
    );

    // updateUrl records the card it is about to carry on history.state via
    // setCurrentState(newState) before dispatching the router push. Assert on
    // that payload — it is the same `card` decision the back-button restore
    // reads back, and is independent of the router transport.
    const setStateCall = dispatchedSetCurrentState(dispatch);
    expect(setStateCall).toBeDefined();
    const newState = setStateCall?.[0].payload;
    // Clean HEAD unwraps to the model's real query. The reintroduced bug
    // (metabase#56775) carries the composed ad-hoc wrapper whose source is the
    // model itself, so the back button would restore the model wrapping itself.
    expect(newState.card.dataset_query).toEqual(modelCard.dataset_query);
  });

  it("flows objectId through onto location.state", async () => {
    const card = createSavedStructuredCard();
    const question = buildSavedQuestion(card);

    const { dispatch } = await setup({
      question,
      options: { dirty: true, replaceState: false, objectId: "42" },
    });

    expect(getDispatchedNavigation(dispatch)?.descriptor.state.objectId).toBe(
      "42",
    );
  });

  describe("table route preservation", () => {
    it("keeps the canonical /table URL when on a /table/... route", async () => {
      const question = buildPristineTableQuestion();
      const expectedUrl = Urls.table({
        id: ORDERS_ID,
        name: question.metadata().table(ORDERS_ID)?.display_name,
      });

      window.history.replaceState({}, "", "/table/anything");

      const { dispatch } = await setup({
        question,
        options: { queryBuilderMode: "view" },
      });

      const navigation = getDispatchedNavigation(dispatch);
      expect(navigation?.descriptor.pathname).toBe(expectedUrl);
      expect(navigation?.descriptor.pathname).toBe(
        getTableUrlForPristineQuestion(question),
      );
    });

    it("falls through to the card-state URL when off a /table/... route", async () => {
      const question = buildPristineTableQuestion();

      window.history.replaceState({}, "", "/question");

      const { dispatch } = await setup({
        question,
        options: { queryBuilderMode: "view" },
      });

      const pathname = getDispatchedNavigation(dispatch)?.descriptor.pathname;
      expect(pathname).toBe("/question");
      expect(pathname).not.toMatch(/^\/table\//);
    });

    it("falls through to the card-state URL on a /table/... route when objectId is set", async () => {
      const question = buildPristineTableQuestion();

      window.history.replaceState({}, "", "/table/anything");

      const { dispatch } = await setup({
        question,
        options: { queryBuilderMode: "view", objectId: "5" },
      });

      expect(
        getDispatchedNavigation(dispatch)?.descriptor.pathname,
      ).not.toMatch(/^\/table\//);
    });
  });

  // When dirty is not passed explicitly, updateUrl computes it. A saved question
  // that was edited from the notebook editor must be treated as dirty even when
  // its query happens to match the original again (e.g. add then remove a
  // filter). A dirty saved question serializes its card into the URL hash; a
  // clean one navigates to the plain URL with no hash. (metabase#48829)
  describe("dirty computation (isModifiedFromNotebook)", () => {
    it("treats a notebook-modified question as dirty even when it matches its original", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      const { dispatch } = await setup({
        question,
        // Identical original ⇒ isDirtyComparedTo is false, so only the
        // isModifiedFromNotebook flag can drive dirtiness here.
        originalCard: card,
        isModifiedFromNotebook: true,
      });

      expect(getDispatchedNavigation(dispatch)?.descriptor.hash).toBeTruthy();
    });

    it("treats an unmodified question matching its original as clean", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      const { dispatch } = await setup({
        question,
        originalCard: card,
        isModifiedFromNotebook: false,
      });

      expect(getDispatchedNavigation(dispatch)?.descriptor.hash).toBeFalsy();
    });
  });
});
