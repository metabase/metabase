import React from "react";
import { shallow } from "enzyme";
import Visualization from "metabase/visualizations/components/Visualization";

import {
  initializeQB,
  navigateToNewCardInsideQB,
} from "metabase/query_builder/actions";
import { parse as urlParse } from "url";

import { useSharedAdminLogin, createTestStore } from "__support__/e2e";

import Question from "metabase-lib/lib/Question";
import {
  SAMPLE_DATASET,
  ORDERS,
  metadata,
} from "__support__/sample_dataset_fixture";
import ChartClickActions from "metabase/visualizations/components/ChartClickActions";

const store = createTestStore();

const getVisualization = (question, results, onChangeCardAndRun) =>
  store.connectContainer(
    <Visualization
      rawSeries={[{ card: question.card(), data: results[0].data }]}
      onChangeCardAndRun={navigateToNewCardInsideQB}
      metadata={metadata}
    />,
  );

const question = Question.create({
  databaseId: SAMPLE_DATASET.id,
  tableId: ORDERS.id,
  metadata,
})
  .query()
  .aggregate(["count"])
  .question();

describe("Visualization drill-through", () => {
  beforeAll(async () => {
    useSharedAdminLogin();
  });

  // NOTE: Should this be here or somewhere in QB directory?
  // see docstring of navigateToNewCardInsideQB for all possible scenarios
  describe("drill-through action inside query builder", () => {
    describe("for an unsaved question", () => {
      pending();
      it("results in a correct url", async () => {
        // NON-TESTED CODE FOLLOWS, JUST DOCUMENTING THE IDEA

        // initialize the query builder state
        // (we are intentionally simplifying things by not rendering the QB but just focusing the redux state instead)
        await store.dispatch(initializeQB(urlParse(question.getUrl()), {}));

        const results = await question.apiGetResults();
        const viz = shallow(
          getVisualization(question, results, navigateToNewCardInsideQB),
        );
        const clickActions = viz.find(ChartClickActions).dive();

        const action = {}; // gets some real mode action here
        // we should make handleClickAction async so that we know when navigateToNewCardInsideQB is ready
        // (that actually only applies to the saved card scenario)
        await clickActions.instance().handleClickAction(action);
        expect(history.getCurrentLocation().hash).toBe("this-value-is-fixed");
      });

      it("shows the name and lineage correctly", () => {
        // requires writing a new selector for QB
        const getLineage = store => {};
        expect(getLineage(store.getState())).toBe("some value");
      });

      it("results in correct query result", () => {});
    });

    describe("for a clean saved question", () => {
      pending();

      it("results in a correct url", async () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });

    describe("for a dirty saved question", () => {
      pending();

      it("results in a correct url", () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });
  });

  describe("title/legend click action from dashboard", () => {
    pending();

    // NOTE Atte Keinänen 6/21/17: Listing here the scenarios that would be nice to test
    // although we should start with a representative subset of these

    describe("from a scalar card title", () => {
      it("results in a correct url", () => {});
      it("shows the name lineage correctly", () => {});
      it("results in correct query result", () => {});
    });

    describe("from a dashcard multiscalar legend", () => {
      it("results in a correct url", () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });
  });

  describe("drill-through action from dashboard", () => {
    pending();
    describe("from a scalar card value", () => {
      it("results in a correct url", () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });

    describe("from a scalar with active filter applied", () => {
      it("results in a correct url", () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });

    describe("from a aggregation multiscalar legend", () => {
      it("results in a correct url", () => {});
      it("shows the name and lineage correctly", () => {});
      it("results in correct query result", () => {});
    });
  });
});
