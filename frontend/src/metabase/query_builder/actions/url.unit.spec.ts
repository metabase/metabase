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
import { checkNotNull } from "metabase/utils/types";
import registerVisualizations from "metabase/visualizations/register";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

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
};

async function setup({
  question,
  options = {},
  currentState = null,
}: SetupOpts) {
  const dispatch = jest.fn();
  const qb = createMockQueryBuilderState({
    card: question.card(),
    originalCard: null,
    currentState,
    uiControls: createMockQueryBuilderUIControlsState({
      queryBuilderMode: "view",
    }),
  });
  const getState = () => ({
    ...createMockState(),
    qb,
  });

  await updateUrl(question, options)(dispatch, getState as any);

  return { dispatch };
}

describe("QB Actions > updateUrl (navigation producer contract)", () => {
  beforeEach(() => {
    console.warn = jest.fn();
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
});
