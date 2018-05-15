import {
  useSharedAdminLogin,
  whenOffline,
  createSavedQuestion,
  createTestStore,
} from "__support__/integrated_tests";
import { click, clickButton } from "__support__/enzyme_utils";

import React from "react";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { mount } from "enzyme";
import {
  INITIALIZE_QB,
  QUERY_COMPLETED,
  QUERY_ERRORED,
  RUN_QUERY,
  CANCEL_QUERY,
  API_UPDATE_QUESTION,
} from "metabase/query_builder/actions";
import { SET_ERROR_PAGE } from "metabase/redux/app";

import QueryHeader from "metabase/query_builder/components/QueryHeader";
import { VisualizationEmptyState } from "metabase/query_builder/components/QueryVisualization";

import RunButton from "metabase/query_builder/components/RunButton";

import Visualization from "metabase/visualizations/components/Visualization";

import {
  ORDERS_TOTAL_FIELD_ID,
  unsavedOrderCountQuestion,
} from "__support__/sample_dataset_fixture";
import VisualizationError from "metabase/query_builder/components/VisualizationError";
import SaveQuestionModal from "metabase/containers/SaveQuestionModal";
import Radio from "metabase/components/Radio";
import QuestionSavedModal from "metabase/components/QuestionSavedModal";

describe("QueryBuilder", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });
  describe("for saved questions", async () => {
    let savedQuestion = null;
    beforeAll(async () => {
      savedQuestion = await createSavedQuestion(unsavedOrderCountQuestion);
    });

    it("renders normally on page load", async () => {
      const store = await createTestStore();
      store.pushPath(savedQuestion.getUrl(savedQuestion));
      const qbWrapper = mount(store.connectContainer(<QueryBuilder />));

      await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);
      expect(
        qbWrapper
          .find(QueryHeader)
          .find("h1")
          .text(),
      ).toBe(savedQuestion.displayName());
    });
    it("shows an error page if the server is offline", async () => {
      const store = await createTestStore();

      await whenOffline(async () => {
        store.pushPath(savedQuestion.getUrl());
        mount(store.connectContainer(<QueryBuilder />));
        // only test here that the error page action is dispatched
        // (it is set on the root level of application React tree)
        await store.waitForActions([SET_ERROR_PAGE]);
      });
    });
    it("doesn't execute the query if user cancels it", async () => {
      const store = await createTestStore();
      store.pushPath(savedQuestion.getUrl());
      const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
      await store.waitForActions([INITIALIZE_QB, RUN_QUERY]);

      const runButton = qbWrapper.find(RunButton);
      expect(runButton.text()).toBe("Cancel");
      click(runButton);

      await store.waitForActions([CANCEL_QUERY, QUERY_ERRORED]);
      expect(
        qbWrapper
          .find(QueryHeader)
          .find("h1")
          .text(),
      ).toBe(savedQuestion.displayName());
      expect(qbWrapper.find(VisualizationEmptyState).length).toBe(1);
    });
  });

  describe("for dirty questions", async () => {
    describe("without original saved question", () => {
      it("renders normally on page load", async () => {
        const store = await createTestStore();
        store.pushPath(unsavedOrderCountQuestion.getUrl());
        const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
        await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

        expect(
          qbWrapper
            .find(QueryHeader)
            .find("h1")
            .text(),
        ).toBe("New question");
        expect(qbWrapper.find(Visualization).length).toBe(1);
      });
      it("fails with a proper error message if the query is invalid", async () => {
        const invalidQuestion = unsavedOrderCountQuestion
          .query()
          .addBreakout(["datetime-field", ["field-id", 12345], "day"])
          .question();

        const store = await createTestStore();
        store.pushPath(invalidQuestion.getUrl());
        const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
        await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

        // TODO: How to get rid of the delay? There is asynchronous initialization in some of VisualizationError parent components
        // Making the delay shorter causes Jest test runner to crash, see https://stackoverflow.com/a/44075568
        expect(
          qbWrapper
            .find(QueryHeader)
            .find("h1")
            .text(),
        ).toBe("New question");
        expect(qbWrapper.find(VisualizationError).length).toBe(1);
        expect(
          qbWrapper
            .find(VisualizationError)
            .text()
            .includes("There was a problem with your question"),
        ).toBe(true);
      });
      it("fails with a proper error message if the server is offline", async () => {
        const store = await createTestStore();

        await whenOffline(async () => {
          store.pushPath(unsavedOrderCountQuestion.getUrl());
          const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
          await store.waitForActions([INITIALIZE_QB, QUERY_ERRORED]);

          expect(
            qbWrapper
              .find(QueryHeader)
              .find("h1")
              .text(),
          ).toBe("New question");
          expect(qbWrapper.find(VisualizationError).length).toBe(1);
          expect(
            qbWrapper
              .find(VisualizationError)
              .text()
              .includes("We're experiencing server issues"),
          ).toBe(true);
        });
      });
      it("doesn't execute the query if user cancels it", async () => {
        const store = await createTestStore();
        store.pushPath(unsavedOrderCountQuestion.getUrl());
        const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
        await store.waitForActions([INITIALIZE_QB, RUN_QUERY]);

        const runButton = qbWrapper.find(RunButton);
        expect(runButton.text()).toBe("Cancel");
        click(runButton);

        await store.waitForActions([CANCEL_QUERY, QUERY_ERRORED]);
        expect(
          qbWrapper
            .find(QueryHeader)
            .find("h1")
            .text(),
        ).toBe("New question");
        expect(qbWrapper.find(VisualizationEmptyState).length).toBe(1);
      });
    });
    describe("with original saved question", () => {
      it("should let you replace the original question", async () => {
        const store = await createTestStore();
        const savedQuestion = await createSavedQuestion(
          unsavedOrderCountQuestion,
        );

        const dirtyQuestion = savedQuestion
          .query()
          .addBreakout(["field-id", ORDERS_TOTAL_FIELD_ID])
          .question();

        store.pushPath(dirtyQuestion.getUrl(savedQuestion));
        const qbWrapper = mount(store.connectContainer(<QueryBuilder />));
        await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

        const title = qbWrapper.find(QueryHeader).find("h1");
        expect(title.text()).toBe("New question");
        expect(
          title
            .parent()
            .children()
            .at(1)
            .text(),
        ).toBe(`started from ${savedQuestion.displayName()}`);

        // Click "SAVE" button
        click(
          qbWrapper
            .find(".Header-buttonSection a")
            .first()
            .find("a"),
        );

        expect(
          qbWrapper
            .find(SaveQuestionModal)
            .find(Radio)
            .prop("value"),
        ).toBe("overwrite");
        // Click Save in "Save question" dialog
        clickButton(
          qbWrapper
            .find(SaveQuestionModal)
            .find("button")
            .last(),
        );
        await store.waitForActions([API_UPDATE_QUESTION]);

        // Should not show a "add to dashboard" dialog in this case
        // This is included because of regression #6541
        expect(qbWrapper.find(QuestionSavedModal).length).toBe(0);
      });
    });
  });
});
