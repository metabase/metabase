import React from "react";
import { Provider } from "react-redux";
import {
  render,
  screen,
  fireEvent,
  within,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import xhrMock from "xhr-mock";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { getStore } from "__support__/entities-store";
import {
  state,
  ORDERS,
  SAMPLE_DATASET,
} from "__support__/sample_dataset_fixture";
import JoinStep from "./JoinStep";
import { jest } from "@jest/globals";

describe("Notebook Editor > Join Step", () => {
  const TEST_QUERY = new StructuredQuery(ORDERS.question(), {
    type: "query",
    database: SAMPLE_DATASET.id,
    query: {
      "source-table": ORDERS.id,
    },
  });

  const TEST_STEP = {
    id: "0:join",
    type: "join",
    itemIndex: 0,
    stageIndex: 0,
    query: TEST_QUERY,
    valid: true,
    visible: true,
    active: true,
    actions: [],
    update: jest.fn(),
    clean: jest.fn(),
    revert: jest.fn(),
  };

  function setup() {
    const updateQuery = jest.fn();
    render(
      <Provider store={getStore({}, state)}>
        <JoinStep
          query={TEST_QUERY}
          step={TEST_STEP}
          updateQuery={updateQuery}
        />
      </Provider>,
    );
    return { updateQuery };
  }

  beforeEach(() => {
    xhrMock.setup();
    xhrMock.get("/api/database", {
      body: JSON.stringify({
        total: 1,
        data: [SAMPLE_DATASET._plainObject],
      }),
    });
    xhrMock.get("/api/database/1/schemas", {
      body: JSON.stringify(["PUBLIC"]),
    });
    xhrMock.get("/api/database/1/schema/PUBLIC", {
      body: JSON.stringify(
        SAMPLE_DATASET.tables.filter(table => table.schema === "PUBLIC"),
      ),
    });
  });

  afterEach(() => {
    xhrMock.teardown();
  });

  it("displays a source table and suggests to pick a join table", () => {
    setup();
    expect(screen.queryByText("Orders")).toBeInTheDocument();
    expect(screen.queryByText("Pick a table...")).toBeInTheDocument();
  });

  it("opens a schema browser by default", async () => {
    setup();

    fireEvent.click(screen.queryByText(/Sample Dataset/i));
    const dataSelector = await screen.findByTestId("data-selector");

    SAMPLE_DATASET.tables.forEach(table => {
      const tableName = new RegExp(table.display_name, "i");
      expect(within(dataSelector).queryByText(tableName)).toBeInTheDocument();
    });
  });
});
