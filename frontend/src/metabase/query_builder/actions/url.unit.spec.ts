// Characterization test for the navigation PRODUCER seam.
//
// This pins updateUrl -> navigate(to, { replace, state }), the QB side that
// decides whether to add or replace a history entry and what card state to carry
// on it. Complementary to router/navigate-contract.unit.spec.tsx, which pins the
// other side: how `navigate` drives the router.

import { createMockEntitiesState } from "__support__/store";
import { getMetadata } from "metabase/metadata-store";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase/redux/store/mocks";
import {
  type NavigateOptions,
  type To,
  getIsNavigationPending,
  navigate,
} from "metabase/router";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  ORDERS_ID,
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import { SET_CURRENT_STATE } from "../store/actions";
import { getTableUrlForPristineQuestion } from "../utils";

import { updateUrl } from "./url";

registerVisualizations();

jest.mock("metabase/router", () => ({
  ...jest.requireActual("metabase/router"),
  navigate: jest.fn(),
  getIsNavigationPending: jest.fn(() => false),
}));

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

// Re-presents the `navigate(to, options)` call as the descriptor the assertions
// below were written against: `state` rides in the options, and replacing vs
// adding a history entry is the `replace` flag rather than a method name.
function getDispatchedNavigation() {
  // `navigate` is overloaded, so `jest.mocked` records its calls as the delta
  // form. `updateUrl` only ever uses the target form.
  const calls = jest.mocked(navigate).mock.calls as unknown as Array<
    [To, NavigateOptions | undefined]
  >;
  const call = calls.at(-1);
  if (!call) {
    return null;
  }
  const [to, options] = call;
  return {
    method: options?.replace ? "replace" : "push",
    descriptor: {
      ...(typeof to === "string" ? {} : to),
      state: options?.state,
    },
  };
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

  await updateUrl(question, options)(dispatch, getState);

  return { dispatch };
}

describe("QB Actions > updateUrl (navigation producer contract)", () => {
  beforeEach(() => {
    jest.mocked(navigate).mockClear();
    // Reset here rather than at the end of the test that sets it, so a failing
    // expectation cannot leak the pending state into the tests that follow.
    jest.mocked(getIsNavigationPending).mockReturnValue(false);
    jest.spyOn(console, "warn").mockImplementation(() => {});
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("carries the serialized card on location.state (back/forward restore contract)", async () => {
    const card = createSavedStructuredCard();
    const question = buildSavedQuestion(card);

    await setup({
      question,
      options: { dirty: true, replaceState: false },
    });

    const navigation = getDispatchedNavigation();
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

      await setup({
        question,
        options: { dirty: false },
        currentState: { card: question.card(), serializedCard: "" },
      });

      expect(getDispatchedNavigation()?.method).toBe("replace");
    });

    it("forces replace when replaceState is explicitly true", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      await setup({
        question,
        options: { dirty: true, replaceState: true },
      });

      expect(getDispatchedNavigation()?.method).toBe("replace");
    });

    it("forces push when replaceState is explicitly false", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      await setup({
        question,
        options: { dirty: false, replaceState: false },
        currentState: { card: question.card(), serializedCard: "" },
      });

      expect(getDispatchedNavigation()?.method).toBe("push");
    });
  });

  it("short-circuits (no navigation, no setCurrentState) when the card and URL are both unchanged", async () => {
    const card = createSavedStructuredCard();
    const question = buildSavedQuestion(card);

    // First run: observe the descriptor the question produces.
    await setup({
      question,
      options: { dirty: false },
    });
    const descriptor = checkNotNull(getDispatchedNavigation()).descriptor;

    // Align window.location with the descriptor so isSameURL becomes true, and
    // set currentState.card to the same card so isSameCard becomes true.
    const search = descriptor.search ?? "";
    const hash = descriptor.hash ?? "";
    window.history.replaceState(
      {},
      "",
      `${descriptor.pathname}${search}${hash}`,
    );

    // `navigate` is a module mock, so the first run's call would otherwise still
    // be the latest one.
    jest.mocked(navigate).mockClear();

    const { dispatch } = await setup({
      question,
      options: { dirty: false },
      currentState: { card: question.card(), serializedCard: "" },
    });

    expect(getDispatchedNavigation()).toBeNull();
    expect(dispatchedSetCurrentState(dispatch)).toBeUndefined();
  });

  describe("preserveNavbarState", () => {
    it("merges preserveNavbarState into location.state on the replace path", async () => {
      const card = createSavedStructuredCard();
      const question = buildSavedQuestion(card);

      await setup({
        question,
        options: { dirty: true, replaceState: true, preserveNavbarState: true },
      });

      const navigation = getDispatchedNavigation();
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

      await setup({
        question,
        options: {
          dirty: true,
          replaceState: false,
          preserveNavbarState: true,
        },
      });

      const navigation = getDispatchedNavigation();
      expect(navigation?.method).toBe("push");
      expect(navigation?.descriptor.state).not.toHaveProperty(
        "preserveNavbarState",
      );
    });
  });

  // Saving a card finishes asynchronously. A `route.lazy` destination keeps the
  // query builder mounted while its chunk loads, so this can run after the user
  // has been sent elsewhere, and a navigation here would replace that pending
  // one. See dashboard-questions.cy.spec.js, which caught it.
  it("does not navigate while the router has a navigation pending", async () => {
    jest.mocked(getIsNavigationPending).mockReturnValue(true);

    const card = createSavedStructuredCard();
    await setup({
      question: buildSavedQuestion(card),
      options: { dirty: true },
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("flows objectId through onto location.state", async () => {
    const card = createSavedStructuredCard();
    const question = buildSavedQuestion(card);

    await setup({
      question,
      options: { dirty: true, replaceState: false, objectId: "42" },
    });

    expect(getDispatchedNavigation()?.descriptor.state.objectId).toBe("42");
  });

  describe("table route preservation", () => {
    it("keeps the canonical /table URL when on a /table/... route", async () => {
      const question = buildPristineTableQuestion();
      const expectedUrl = Urls.table({
        id: ORDERS_ID,
        name: question.metadata().table(ORDERS_ID)?.display_name,
      });

      window.history.replaceState({}, "", "/table/anything");

      await setup({
        question,
        options: { queryBuilderMode: "view" },
      });

      const navigation = getDispatchedNavigation();
      expect(navigation?.descriptor.pathname).toBe(expectedUrl);
      expect(navigation?.descriptor.pathname).toBe(
        getTableUrlForPristineQuestion(question),
      );
    });

    it("falls through to the card-state URL when off a /table/... route", async () => {
      const question = buildPristineTableQuestion();

      window.history.replaceState({}, "", "/question");

      await setup({
        question,
        options: { queryBuilderMode: "view" },
      });

      const pathname = getDispatchedNavigation()?.descriptor.pathname;
      expect(pathname).toBe("/question");
      expect(pathname).not.toMatch(/^\/table\//);
    });

    it("falls through to the card-state URL on a /table/... route when objectId is set", async () => {
      const question = buildPristineTableQuestion();

      window.history.replaceState({}, "", "/table/anything");

      await setup({
        question,
        options: { queryBuilderMode: "view", objectId: "5" },
      });

      expect(getDispatchedNavigation()?.descriptor.pathname).not.toMatch(
        /^\/table\//,
      );
    });
  });
});
