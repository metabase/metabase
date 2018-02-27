import {
  useSharedAdminLogin,
  createTestStore,
} from "__support__/integrated_tests";
import { click } from "__support__/enzyme_utils";

import React from "react";
import { mount, shallow } from "enzyme";

import ActionsWidget from "../../../src/metabase/query_builder/components/ActionsWidget";
import Question from "metabase-lib/lib/Question";
import {
  DATABASE_ID,
  ORDERS_TABLE_ID,
  metadata,
} from "__support__/sample_dataset_fixture";
import {
  INITIALIZE_QB,
  LOAD_TABLE_METADATA,
  QUERY_COMPLETED,
} from "metabase/query_builder/actions";
import { MetricApi } from "metabase/services";

const getActionsWidget = question => (
  <ActionsWidget
    question={question}
    card={question.card()}
    setCardAndRun={() => {}}
    navigateToNewCardInsideQB={() => {}}
  />
);

describe("ActionsWidget", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  it("is visible for an empty question", () => {
    const question: Question = Question.create({
      databaseId: DATABASE_ID,
      tableId: ORDERS_TABLE_ID,
      metadata,
    })
      .query()
      .question();

    const component = shallow(getActionsWidget(question));
    expect(component.children().children().length).toBeGreaterThan(0);
  });

  describe("for metrics", () => {
    let activeMetricId;

    beforeAll(async () => {
      useSharedAdminLogin();

      const metricDef = {
        name: "A Metric",
        description: "For testing new question flow",
        table_id: 1,
        show_in_getting_started: true,
        definition: { database: 1, query: { aggregation: ["count"] } },
      };
      activeMetricId = (await MetricApi.create(metricDef)).id;

      const retiredMetricId = (await MetricApi.create(metricDef)).id;
      // Retiring a metric is done with the `delete` endpoint
      await MetricApi.delete({
        metricId: retiredMetricId,
        revision_message: "Time to retire this buddy",
      });
    });

    afterAll(async () => {
      await MetricApi.delete({
        metricId: activeMetricId,
        revision_message: "You are now a retired veteran too",
      });
    });

    it("shows metrics for the current table, excluding the retired ones", async () => {
      const url = Question.create({
        databaseId: DATABASE_ID,
        tableId: ORDERS_TABLE_ID,
        metadata,
      })
        .query()
        .question()
        .getUrl();

      const store = await createTestStore();
      store.pushPath(url);
      const app = mount(store.getAppContainer());

      await store.waitForActions([
        INITIALIZE_QB,
        QUERY_COMPLETED,
        LOAD_TABLE_METADATA,
      ]);

      const actionsWidget = app.find(ActionsWidget);
      click(actionsWidget.childAt(0));

      expect(actionsWidget.find('strong[children="A Metric"]').length).toBe(1);
    });
  });
});
