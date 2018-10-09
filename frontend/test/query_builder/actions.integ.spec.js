import {
  ORDERS_TOTAL_FIELD_ID,
  unsavedOrderCountQuestion,
} from "__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";
import { parse as urlParse } from "url";
import {
  createSavedQuestion,
  createTestStore,
  useSharedAdminLogin,
} from "__support__/integrated_tests";
import { initializeQB } from "metabase/query_builder/actions";
import {
  getCard,
  getOriginalCard,
  getQueryResults,
} from "metabase/query_builder/selectors";
import _ from "underscore";

jest.mock("metabase/lib/analytics");

// TODO: Convert completely to modern style

describe("QueryBuilder", () => {
  let savedCleanQuestion: Question = null;
  let dirtyQuestion: Question = null;
  let store = null;

  beforeAll(async () => {
    useSharedAdminLogin();
    store = await createTestStore();
  });

  describe("initializeQb", () => {
    beforeAll(async () => {
      savedCleanQuestion = await createSavedQuestion(unsavedOrderCountQuestion);

      dirtyQuestion = savedCleanQuestion
        .query()
        .addBreakout(["field-id", ORDERS_TOTAL_FIELD_ID])
        .question();
    });

    describe("for unsaved questions", () => {
      it("completes successfully", async () => {
        const location = urlParse(unsavedOrderCountQuestion.getUrl());
        await store.dispatch(initializeQB(location, {}));
      });

      it("results in the correct card object in redux state", async () => {
        expect(getCard(store.getState())).toMatchObject(
          unsavedOrderCountQuestion.card(),
        );
      });

      it("results in an empty original_card object in redux state", async () => {
        expect(getOriginalCard(store.getState())).toEqual(null);
      });

      it("keeps the url same after initialization is finished", async () => {
        expect(store.getPath()).toBe(unsavedOrderCountQuestion.getUrl());
      });

      // TODO: setTimeout for
      xit("fetches the query results", async () => {
        expect(getQueryResults(store.getState()) !== null).toBe(true);
      });
    });
    describe("for saved questions", async () => {
      describe("with clean state", () => {
        it("completes successfully", async () => {
          const location = urlParse(
            savedCleanQuestion.getUrl(savedCleanQuestion),
          );
          // pass the card id explicitly as we are not using react-router parameter resolution here
          await store.dispatch(
            initializeQB(location, { cardId: savedCleanQuestion.id() }),
          );
        });

        it("results in the correct card object in redux state", async () => {
          expect(getCard(store.getState())).toMatchObject(
            _.omit(savedCleanQuestion.card(), "original_card_id"),
          );
        });

        it("results in the correct original_card object in redux state", async () => {
          expect(getOriginalCard(store.getState())).toMatchObject(
            _.omit(savedCleanQuestion.card(), "original_card_id"),
          );
        });
        it("keeps the url same after initialization is finished", async () => {
          expect(store.getPath()).toBe(
            savedCleanQuestion.getUrl(savedCleanQuestion),
          );
        });
      });
      describe("with dirty state", () => {
        it("completes successfully", async () => {
          const location = urlParse(dirtyQuestion.getUrl(savedCleanQuestion));
          await store.dispatch(initializeQB(location, {}));
        });

        it("results in the correct card object in redux state", async () => {
          expect(dirtyQuestion.card()).toMatchObject(getCard(store.getState()));
        });

        it("results in the correct original_card object in redux state", async () => {
          expect(getOriginalCard(store.getState())).toMatchObject(
            _.omit(savedCleanQuestion.card(), "original_card_id"),
          );
        });
        it("keeps the url same after initialization is finished", async () => {
          expect(store.getPath()).toBe(dirtyQuestion.getUrl());
        });
      });
    });
  });

  describe("runQuestionQuery", () => {
    it("returns the correct query results for a valid query", () => {
      pending();
    });
    it("returns a correctly formatted error for invalid queries", () => {
      pending();
    });

    // TODO: This would be really good to test but not exactly sure how
    xit("ignores cache when `{ignoreCache = true}`", () => {
      pending();
    });

    it("can be cancelled with `cancelQueryDeferred`", () => {
      pending();
    });
  });

  describe("navigateToNewCardInsideQB", () => {
    // The full drill-trough flow including navigateToNewCardInsideQB is tested in Visualization.spec.js
  });
});
