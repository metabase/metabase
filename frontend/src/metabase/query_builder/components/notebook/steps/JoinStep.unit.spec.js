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

jest.setTimeout(10000);

describe("Notebook Editor > Join Step", () => {
  const TEST_QUERY = {
    type: "query",
    database: SAMPLE_DATASET.id,
    query: {
      "source-table": ORDERS.id,
    },
  };

  function JoinStepWrapped({ initialQuery, onChange, ...props }) {
    const [query, setQuery] = useState(initialQuery);
    return (
      <JoinStep
        {...props}
        query={query}
        updateQuery={datasetQuery => {
          const newQuery = query.setDatasetQuery(datasetQuery);
          setQuery(newQuery);
          onChange(datasetQuery);
        }}
      />
    );
  }

  function setup() {
    const query = new StructuredQuery(ORDERS.question(), TEST_QUERY);
    const onQueryChange = jest.fn();

    const TEST_STEP = {
      id: "0:join",
      type: "join",
      itemIndex: 0,
      stageIndex: 0,
      query,
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
        <JoinStepWrapped
          initialQuery={query}
          step={TEST_STEP}
          onChange={onQueryChange}
        />
      </Provider>,
    );

    return { onQueryChange };
  }

  function toFieldRef(field, joinedTable) {
    return [
      "field",
      field.id,
      joinedTable ? { "join-alias": joinedTable.display_name } : null,
    ];
  }

  function expectedJoin({
    fields = "all",
    joinedTable,
    leftField,
    rightField,
  }) {
    const joinFields = Array.isArray(fields)
      ? fields.map(field => toFieldRef(field, joinedTable))
      : fields;

    return {
      ...TEST_QUERY,
      query: {
        ...TEST_QUERY.query,
        joins: [
          expect.objectContaining({
            fields: joinFields,
            "source-table": joinedTable.id,
            condition: [
              "=",
              toFieldRef(leftField),
              toFieldRef(rightField, joinedTable),
            ],
          }),
        ],
      },
    };
  }

  async function selectTable(tableName) {
    fireEvent.click(screen.queryByText(/Sample Dataset/i));
    const dataSelector = await screen.findByTestId("data-selector");
    fireEvent.click(within(dataSelector).queryByText(tableName));

    await waitForElementToBeRemoved(() =>
      screen.queryByTestId("data-selector"),
    );
  }

  function openDimensionPicker(type) {
    const openPickerButton = screen.getByTestId(`${type}-dimension`);
    fireEvent.click(openPickerButton);
    return screen.findByRole("rowgroup");
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
    const { onQueryChange } = setup();

    await selectTable(/Products/i);

    expect(screen.getByTestId("parent-dimension")).toHaveTextContent(
      /Product ID/i,
    );
    expect(screen.getByTestId("join-dimension")).toHaveTextContent(/ID/i);
    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        leftField: ORDERS.PRODUCT_ID,
        rightField: PRODUCTS.ID,
      }),
    );
  });

  it("shows a parent dimension's join field picker", async () => {
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

  it("can change parent dimension's join field", async () => {
    const { onQueryChange } = setup();
    await selectTable(/Products/i);
    const picker = await openDimensionPicker("parent");

    fireEvent.click(within(picker).getByText("Tax"));

    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        leftField: ORDERS.TAX,
        rightField: PRODUCTS.ID,
      }),
    );
  });

  it("shows a join dimension's field picker", async () => {
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

  it("can change join dimension's field", async () => {
    const { onQueryChange } = setup();
    await selectTable(/Products/i);
    const picker = await openDimensionPicker("join");

    fireEvent.click(within(picker).getByText("Category"));

    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        leftField: ORDERS.PRODUCT_ID,
        rightField: PRODUCTS.CATEGORY,
      }),
    );
  });

  it("automatically opens dimensions picker if can't automatically set join fields", async () => {
    setup();

    await selectTable(/Reviews/i);

    const picker = await screen.findByRole("rowgroup");
    expect(picker).toBeInTheDocument();
    expect(picker).toBeVisible();
    expect(within(picker).queryByText("Order")).toBeInTheDocument();
  });

  it("can select fields to select from a joined table", async () => {
    const { onQueryChange } = setup();
    await selectTable(/Products/i);

    fireEvent.click(screen.getByLabelText("table icon"));
    fireEvent.click(screen.getByText("Select None"));
    fireEvent.click(screen.getByText("Category"));

    expect(onQueryChange).toHaveBeenLastCalledWith(
      expectedJoin({
        joinedTable: PRODUCTS,
        leftField: ORDERS.PRODUCT_ID,
        rightField: PRODUCTS.ID,
        fields: [PRODUCTS.CATEGORY],
      }),
    );
  });
});
