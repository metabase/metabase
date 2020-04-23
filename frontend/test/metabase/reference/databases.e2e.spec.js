import { useSharedAdminLogin, createTestStore } from "__support__/e2e";
import { click, clickButton, setInputValue } from "__support__/enzyme";

import React from "react";
import { mount } from "enzyme";

import { CardApi, MetabaseApi } from "metabase/services";

import {
  FETCH_DATABASE_METADATA,
  FETCH_REAL_DATABASES,
} from "metabase/redux/metadata";

import { END_LOADING } from "metabase/reference/reference";

import DatabaseListContainer from "metabase/reference/databases/DatabaseListContainer";
import DatabaseDetailContainer from "metabase/reference/databases/DatabaseDetailContainer";
import TableListContainer from "metabase/reference/databases/TableListContainer";
import TableDetailContainer from "metabase/reference/databases/TableDetailContainer";
import TableQuestionsContainer from "metabase/reference/databases/TableQuestionsContainer";
import FieldListContainer from "metabase/reference/databases/FieldListContainer";
import FieldDetailContainer from "metabase/reference/databases/FieldDetailContainer";

import DatabaseList from "metabase/reference/databases/DatabaseList";
import List from "metabase/components/List";
import ListItem from "metabase/components/ListItem";
import ReferenceHeader from "metabase/reference/components/ReferenceHeader";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";
import UsefulQuestions from "metabase/reference/components/UsefulQuestions";
import Detail from "metabase/reference/components/Detail";
import QueryButton from "metabase/components/QueryButton";
import { INITIALIZE_QB, QUERY_COMPLETED } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import { delay } from "metabase/lib/promise";

describe("The Reference Section", () => {
  // Test data
  const cardDef = {
    name: "A card",
    display: "scalar",
    dataset_query: {
      database: 1,
      type: "query",
      query: { "source-table": 1, aggregation: [["count"]] },
    },
    visualization_settings: {},
  };

  // Scaffolding
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  describe("The Data Reference for the Sample Database", async () => {
    // database list
    it("should see databases", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/");
      const container = mount(
        store.connectContainer(<DatabaseListContainer />),
      );
      await store.waitForActions([FETCH_REAL_DATABASES, END_LOADING]);

      expect(container.find(ReferenceHeader).length).toBe(1);
      expect(container.find(DatabaseList).length).toBe(1);
      expect(container.find(AdminAwareEmptyState).length).toBe(0);

      expect(container.find(List).length).toBe(1);
      expect(container.find(ListItem).length).toBeGreaterThanOrEqual(1);
    });

    // database list
    it("should not see saved questions in the database list", async () => {
      const card = await CardApi.create(cardDef);
      const store = await createTestStore();
      store.pushPath("/reference/databases/");
      const container = mount(
        store.connectContainer(<DatabaseListContainer />),
      );
      await store.waitForActions([FETCH_REAL_DATABASES, END_LOADING]);

      expect(container.find(ReferenceHeader).length).toBe(1);
      expect(container.find(DatabaseList).length).toBe(1);
      expect(container.find(AdminAwareEmptyState).length).toBe(0);

      expect(container.find(List).length).toBe(1);
      expect(container.find(ListItem).length).toBe(1);

      expect(card.name).toBe(cardDef.name);

      await CardApi.delete({ cardId: card.id });
    });

    // database detail
    it("should see a the detail view for the sample database", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1");
      mount(store.connectContainer(<DatabaseDetailContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
    });

    // database update
    it("should update the sample database", async () => {
      // create a new db by cloning #1
      const d1 = await MetabaseApi.db_get({ dbId: 1 });
      const { id } = await MetabaseApi.db_create(d1);

      // go to that db's reference page
      const store = await createTestStore();
      store.pushPath(`/reference/databases/${id}`);
      const app = mount(store.connectContainer(<DatabaseDetailContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);

      // switch to edit view
      const editButton = app.find(".Button");

      clickButton(editButton);

      // update "caveats" and save
      const textarea = app
        .find(Detail)
        .at(2)
        .find("textarea");
      setInputValue(textarea, "v important thing");

      const doneButton = app.find(".Button--primary");

      clickButton(doneButton);
      await store.waitForActions(END_LOADING);
      // unfortunately this is required?
      await delay(200);

      // check that the field was updated
      const savedText = app
        .find(Detail)
        .at(2)
        .find("span")
        .at(1)
        .text();

      expect(savedText).toBe("v important thing");

      // clean up
      await MetabaseApi.db_delete({ dbId: id });
    });

    // table list
    it("should see the 4 tables in the sample database", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables");
      mount(store.connectContainer(<TableListContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
    });
    // table detail

    it("should see the Orders table", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables/1");
      mount(store.connectContainer(<TableDetailContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
    });

    it("should see the Reviews table", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables/2");
      mount(store.connectContainer(<TableDetailContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
    });
    it("should see the Products table", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables/3");
      mount(store.connectContainer(<TableDetailContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
    });
    it("should see the People table", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables/4");
      mount(store.connectContainer(<TableDetailContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
    });
    // field list
    it("should see the fields for the orders table", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables/1/fields");
      mount(store.connectContainer(<FieldListContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
    });
    it("should see the questions for the orders tables", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables/1/questions");
      mount(store.connectContainer(<TableQuestionsContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);

      const card = await CardApi.create(cardDef);

      expect(card.name).toBe(cardDef.name);

      await CardApi.delete({ cardId: card.id });
    });

    // field detail

    it("should see the orders created_at timestamp field", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables/1/fields/1");
      mount(store.connectContainer(<FieldDetailContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
    });

    it("should let you open a potentially useful question for created_at field without errors", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables/1/fields/1");

      const app = mount(store.getAppContainer());

      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
      const fieldDetails = app.find(FieldDetailContainer);
      expect(fieldDetails.length).toBe(1);

      const usefulQuestionLink = fieldDetails
        .find(UsefulQuestions)
        .find(QueryButton)
        .first()
        .find("a");
      expect(usefulQuestionLink.text()).toBe(
        "Number of Orders grouped by Created At",
      );
      click(usefulQuestionLink);

      await store.waitForActions([INITIALIZE_QB, QUERY_COMPLETED]);

      const qbQuery = getQuestion(store.getState()).query();

      // the granularity/subdimension should be applied correctly to the breakout
      expect(JSON.stringify(qbQuery.breakouts())).toEqual(
        JSON.stringify([
          ["datetime-field", ["field-id", 1], "month"], // depends on the date range
        ]),
      );
    });

    it("should see the orders id field", async () => {
      const store = await createTestStore();
      store.pushPath("/reference/databases/1/tables/1/fields/25");
      mount(store.connectContainer(<FieldDetailContainer />));
      await store.waitForActions([FETCH_DATABASE_METADATA, END_LOADING]);
    });
  });
});
