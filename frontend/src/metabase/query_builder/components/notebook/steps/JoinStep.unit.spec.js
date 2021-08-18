/* eslint-disable react/prop-types */
import React, { useState } from "react";
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
  PRODUCTS,
  SAMPLE_DATASET,
} from "__support__/sample_dataset_fixture";
import JoinStep from "./JoinStep";

describe("Notebook Editor > Join Step", () => {
  function JoinStepWrapped({ initialQuery, ...props }) {
    const [query, setQuery] = useState(initialQuery);
    return (
      <JoinStep
        {...props}
        query={query}
        updateQuery={datasetQuery => {
          const newQuery = query.setDatasetQuery(datasetQuery);
          setQuery(newQuery);
        }}
      />
    );
  }

  function setup() {
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

    render(
      <Provider store={getStore({}, state)}>
        <JoinStepWrapped initialQuery={TEST_QUERY} step={TEST_STEP} />
      </Provider>,
    );
  }

  async function selectTable(tableName) {
    fireEvent.click(screen.queryByText(/Sample Dataset/i));
    const dataSelector = await screen.findByTestId("data-selector");
    fireEvent.click(within(dataSelector).queryByText(tableName));

    await waitForElementToBeRemoved(() =>
      screen.queryByTestId("data-selector"),
    );
  }

  beforeEach(() => {
    xhrMock.setup();
    xhrMock.get("/api/database", {
      body: JSON.stringify({
        total: 1,
        data: [SAMPLE_DATASET.getPlainObject()],
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

  it("automatically sets join fields if possible", async () => {
    setup();

    await selectTable(/Products/i);

    expect(screen.getByTestId("parent-dimension")).toHaveTextContent(
      /Product ID/i,
    );
    expect(screen.getByTestId("join-dimension")).toHaveTextContent(/ID/i);
  });

  it("can change parent dimension's join field", async () => {
    const ordersFields = Object.values(ORDERS.fieldsLookup());
    setup();
    await selectTable(/Products/i);

    fireEvent.click(screen.getByTestId("parent-dimension"));

    const picker = await screen.findByRole("rowgroup");
    expect(picker).toBeInTheDocument();
    expect(picker).toBeVisible();
    expect(within(picker).queryByText("Order")).toBeInTheDocument();
    ordersFields.forEach(field => {
      expect(
        within(picker).queryByText(field.display_name),
      ).toBeInTheDocument();
    });
  });

  it("can change join dimension's field", async () => {
    const productsFields = Object.values(PRODUCTS.fieldsLookup());
    setup();
    await selectTable(/Products/i);

    fireEvent.click(screen.getByTestId("join-dimension"));

    const picker = await screen.findByRole("rowgroup");
    expect(picker).toBeInTheDocument();
    expect(picker).toBeVisible();
    expect(within(picker).queryByText("Product")).toBeInTheDocument();
    productsFields.forEach(field => {
      expect(
        within(picker).queryByText(field.display_name),
      ).toBeInTheDocument();
    });
  });

  it("automatically opens dimensions picker if can't automatically set join fields", async () => {
    setup();

    await selectTable(/Reviews/i);

    const picker = await screen.findByRole("rowgroup");
    expect(picker).toBeInTheDocument();
    expect(picker).toBeVisible();
    expect(within(picker).queryByText("Order")).toBeInTheDocument();
  });
});
