import { LocationDescriptorObject } from "history";
import _ from "underscore";
import xhrMock from "xhr-mock";

import * as CardLib from "metabase/lib/card";
import * as Urls from "metabase/lib/urls";

import * as alert from "metabase/alert/alert";
import { setErrorPage } from "metabase/redux/app";

import Question from "metabase-lib/lib/Question";
import {
  getAdHocQuestion,
  getSavedStructuredQuestion,
  getSavedNativeQuestion,
  getUnsavedNativeQuestion,
  getStructuredModel,
  getNativeModel,
} from "metabase-lib/mocks";

import { User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import { Card } from "metabase-types/types/Card";
import { createMockState } from "metabase-types/store/mocks";

import { state as entitiesState } from "__support__/sample_database_fixture";

import * as querying from "../querying";

import * as core from "./core";
import { initializeQB } from "./initializeQB";

function getLocationForQuestion(
  question: Question,
  extra: LocationDescriptorObject = {},
): LocationDescriptorObject {
  const card = question.card();
  const isSaved = question.isSaved();
  return {
    pathname: isSaved ? Urls.question(card) : Urls.serializedQuestion(card),
    hash: !isSaved ? CardLib.serializeCardForUrl(card) : "",
    query: {},
    ...extra,
  };
}

function getQueryParamsForQuestion(
  question: Question,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!question.isSaved()) {
    return extra;
  }
  const id = question.id();
  const name = question.displayName();
  return {
    slug: `${id}-${name}`,
    ...extra,
  };
}

type SetupOpts = {
  question: Question;
  user?: User;
  location?: LocationDescriptorObject;
  params?: Record<string, unknown>;
};

async function setup({
  question,
  user,
  location = getLocationForQuestion(question),
  params = getQueryParamsForQuestion(question),
}: SetupOpts) {
  jest.useFakeTimers();

  const card = question.card();

  if ("id" in card) {
    xhrMock.get(`/api/card/${card.id}`, {
      body: JSON.stringify(card),
    });
  }

  const dispatch = jest.fn().mockReturnValue({ mock: "mock" });

  const state = {
    ...createMockState(),
    ...entitiesState,
  };
  if (user) {
    state.currentUser = user;
  }
  const getState = () => state;

  await initializeQB(location, params)(dispatch, getState);
  jest.runAllTimers();

  const [initQBAction] = dispatch.mock.calls.find(
    call => call[0]?.type === "metabase/qb/INITIALIZE_QB",
  );

  return { dispatch, state, result: initQBAction.payload };
}

describe("QB Actions > initializeQB", () => {
  beforeAll(() => {
    console.warn = jest.fn();
  });

  beforeEach(() => {
    xhrMock.setup();
  });

  afterEach(() => {
    xhrMock.teardown();
    jest.restoreAllMocks();
  });

  const TEST_CASE = {
    SAVED_STRUCTURED_QUESTION: {
      question: getSavedStructuredQuestion(),
      questionType: "saved structured question",
    },
    UNSAVED_STRUCTURED_QUESTION: {
      question: getAdHocQuestion(),
      questionType: "ad-hoc structured question",
    },

    SAVED_NATIVE_QUESTION: {
      question: getSavedNativeQuestion(),
      questionType: "saved native question",
    },
    UNSAVED_NATIVE_QUESTION: {
      question: getUnsavedNativeQuestion(),
      questionType: "unsaved native question",
    },

    STRUCTURED_MODEL: {
      question: getStructuredModel(),
      questionType: "structured model",
    },
    NATIVE_MODEL: {
      question: getNativeModel(),
      questionType: "native model",
    },
  };

  const ALL_TEST_CASES = Object.values(TEST_CASE);

  const SAVED_QUESTION_TEST_CASES = [
    TEST_CASE.SAVED_STRUCTURED_QUESTION,
    TEST_CASE.SAVED_NATIVE_QUESTION,
  ];

  const UNSAVED_QUESTION_TEST_CASES = [
    TEST_CASE.UNSAVED_STRUCTURED_QUESTION,
    TEST_CASE.UNSAVED_NATIVE_QUESTION,
  ];

  const MODEL_TEST_CASES = [TEST_CASE.STRUCTURED_MODEL, TEST_CASE.NATIVE_MODEL];

  describe("common", () => {
    ALL_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("resets QB state before doing anything", async () => {
          const resetQBSpy = jest.spyOn(core, "resetQB");
          await setup({ question });
          expect(resetQBSpy).toHaveBeenCalledTimes(1);
        });

        it("cancels running query before doing anything", async () => {
          const cancelQuerySpy = jest.spyOn(querying, "cancelQuery");
          await setup({ question });
          expect(cancelQuerySpy).toHaveBeenCalledTimes(1);
        });

        it("fetches question metadata", async () => {
          const loadMetadataForCardSpy = jest.spyOn(
            core,
            "loadMetadataForCard",
          );

          await setup({ question });

          expect(loadMetadataForCardSpy).toHaveBeenCalledTimes(1);
          expect(loadMetadataForCardSpy).toHaveBeenCalledWith(
            expect.objectContaining(question.card()),
          );
        });

        it("runs question query in view mode", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          await setup({ question });
          expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
        });

        it("does not run non-runnable question queries", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          jest.spyOn(Question.prototype, "canRun").mockReturnValue(false);

          await setup({ question });

          expect(runQuestionQuerySpy).not.toHaveBeenCalled();
        });

        it("does not run question query in notebook mode", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          const baseUrl = Urls.question(question.card());
          const location = getLocationForQuestion(question, {
            pathname: `${baseUrl}/notebook`,
          });

          await setup({ question, location });

          expect(runQuestionQuerySpy).not.toHaveBeenCalled();
        });

        it("passes object ID from params correctly", async () => {
          const params = getQueryParamsForQuestion(question, { objectId: 123 });
          const { result } = await setup({ question, params });
          expect(result.objectId).toBe(123);
        });

        it("passes object ID from location query params correctly", async () => {
          const location = getLocationForQuestion(question, {
            query: { objectId: 123 },
          });
          const { result } = await setup({ question, location });
          expect(result.objectId).toBe(123);
        });

        it("sets original card id on the card", async () => {
          const { result } = await setup({ question });
          expect(result.card.original_card_id).toBe(question.id());
        });

        it("sets QB mode correctly", async () => {
          const { result } = await setup({ question });
          expect(result.uiControls.queryBuilderMode).toBe("view");
        });

        it("sets QB mode to notebook if opening /notebook route", async () => {
          const baseUrl = Urls.question(question.card());
          const location = getLocationForQuestion(question, {
            pathname: `${baseUrl}/notebook`,
          });

          const { result } = await setup({ question, location });

          expect(result.uiControls.queryBuilderMode).toBe("notebook");
        });
      });
    });
  });

  describe("saved questions and models", () => {
    [...SAVED_QUESTION_TEST_CASES, ...MODEL_TEST_CASES].forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("locks question display", async () => {
          const { result } = await setup({
            question: question.setDisplayIsLocked(false),
          });
          expect(result.card.displayIsLocked).toBe(true);
        });

        it("fetches alerts", async () => {
          const fetchAlertsForQuestionSpy = jest.spyOn(
            alert,
            "fetchAlertsForQuestion",
          );

          await setup({ question });

          expect(fetchAlertsForQuestionSpy).toHaveBeenCalledWith(question.id());
        });

        it("passes object ID from params correctly", async () => {
          const params = getQueryParamsForQuestion(question, { objectId: 123 });
          const { result } = await setup({ question, params });
          expect(result.objectId).toBe(123);
        });

        it("passes object ID from location query params correctly", async () => {
          const location = getLocationForQuestion(question, {
            query: { objectId: 123 },
          });
          const { result } = await setup({ question, location });
          expect(result.objectId).toBe(123);
        });

        describe("newb modal", () => {
          it("shows modal if user has not yet seen it", async () => {
            const { result } = await setup({
              question,
              user: createMockUser({ is_qbnewb: true }),
            });
            expect(result.uiControls.isShowingNewbModal).toBe(true);
          });

          it("does not show modal if user has seen it", async () => {
            const { result } = await setup({
              question,
              user: createMockUser({ is_qbnewb: false }),
            });
            expect(result.uiControls.isShowingNewbModal).toBeFalsy();
          });
        });

        it("throws error for archived card", async () => {
          const { dispatch } = await setup({
            question: question.setCard({
              ...question.card(),
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              archived: true,
            }),
          });

          expect(dispatch).toHaveBeenCalledWith(
            setErrorPage(
              expect.objectContaining({ data: { error_code: "archived" } }),
            ),
          );
        });
      });
    });
  });

  describe("saved questions", () => {
    SAVED_QUESTION_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("throws not found error when opening question with /model URL", async () => {
          const { dispatch } = await setup({
            question,
            location: { pathname: `/model/${question.id()}` },
          });

          expect(dispatch).toHaveBeenCalledWith(
            setErrorPage(
              expect.objectContaining({ data: { error_code: "not-found" } }),
            ),
          );
        });
      });
    });
  });

  describe("unsaved questions", () => {
    UNSAVED_QUESTION_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      const ORIGINAL_CARD_ID = 321;

      function getOriginalQuestion(card?: Partial<Card>) {
        return question.setCard({
          ...question.card(),
          ...card,
          id: ORIGINAL_CARD_ID,
        });
      }

      function setupWithOriginalQuestion({
        originalQuestion,
        question,
        ...opts
      }: SetupOpts & { originalQuestion: Question }) {
        const q = question.setCard({
          ...question.card(),
          original_card_id: ORIGINAL_CARD_ID,
        });

        xhrMock.get(`/api/card/${originalQuestion.id()}`, {
          body: JSON.stringify(originalQuestion.card()),
        });

        return setup({ question: q, ...opts });
      }

      describe(questionType, () => {
        it("loads original card", async () => {
          const originalQuestion = getOriginalQuestion({ display: "line" });

          const { result } = await setupWithOriginalQuestion({
            question,
            originalQuestion,
          });

          expect(result.card.original_card_id).toBe(ORIGINAL_CARD_ID);
          expect(result.originalCard).toEqual(originalQuestion.card());
        });

        it("replaces card with original card if they're equal", async () => {
          const originalQuestion = getOriginalQuestion();

          const { result } = await setupWithOriginalQuestion({
            question,
            originalQuestion,
          });

          expect(result.card.original_card_id).toBeUndefined();
          expect(result.originalCard).toEqual(originalQuestion.card());
          expect(result.card).toEqual(originalQuestion.lockDisplay().card());
        });

        it("does not lock question display", async () => {
          const { result } = await setup({ question });
          expect(result.card.displayIsLocked).toBeFalsy();
        });

        it("does not try to fetch alerts", async () => {
          const fetchAlertsForQuestionSpy = jest.spyOn(
            alert,
            "fetchAlertsForQuestion",
          );

          await setup({ question });

          expect(fetchAlertsForQuestionSpy).not.toHaveBeenCalled();
        });

        it("does not show qbnewb modal", async () => {
          const { result } = await setup({
            question,
            user: createMockUser({ is_qbnewb: true }),
          });
          expect(result.uiControls.isShowingNewbModal).toBeFalsy();
        });

        it("handles error if couldn't deserialize card hash", async () => {
          const error = new Error("failed to deserialize card");
          jest
            .spyOn(CardLib, "deserializeCardFromUrl")
            .mockImplementation(() => {
              throw error;
            });

          const { dispatch } = await setup({ question });

          expect(dispatch).toHaveBeenCalledWith(setErrorPage(error));
        });
      });
    });
  });

  describe("models", () => {
    MODEL_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("runs question query on /query route", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          const baseUrl = Urls.question(question.card());
          const location = getLocationForQuestion(question, {
            pathname: `${baseUrl}/query`,
          });

          await setup({ question, location });

          expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
        });
        it("runs question query on /metadata route", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          const baseUrl = Urls.question(question.card());
          const location = getLocationForQuestion(question, {
            pathname: `${baseUrl}/metadata`,
          });

          await setup({ question, location });

          expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
        });

        it("sets UI state correctly for /query route", async () => {
          const baseUrl = Urls.question(question.card());
          const location = getLocationForQuestion(question, {
            pathname: `${baseUrl}/query`,
          });

          const { result } = await setup({ question, location });

          expect(result.uiControls.queryBuilderMode).toBe("dataset");
          expect(result.uiControls.datasetEditorTab).toBe("query");
        });

        it("sets UI state correctly for /metadata route", async () => {
          const baseUrl = Urls.question(question.card());
          const location = getLocationForQuestion(question, {
            pathname: `${baseUrl}/metadata`,
          });

          const { result } = await setup({ question, location });

          expect(result.uiControls.queryBuilderMode).toBe("dataset");
          expect(result.uiControls.datasetEditorTab).toBe("metadata");
        });
      });
    });
  });
});
