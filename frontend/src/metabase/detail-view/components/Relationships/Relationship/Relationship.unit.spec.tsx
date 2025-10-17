import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupCardDataset } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, waitForLoaderToBeRemoved } from "__support__/ui";
import type { Table } from "metabase-types/api";
import { createMockForeignKey } from "metabase-types/api/mocks";
import {
  type MockDatasetOpts,
  createMockColumn,
} from "metabase-types/api/mocks/dataset";
import {
  ORDERS,
  PRODUCTS,
  createOrdersProductIdField,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { Relationship } from "./Relationship";

const ORDERS_TABLE = createOrdersTable();

const COUNT_COLUMN = createMockColumn({
  id: 1,
  display_name: "Count",
  name: "count",
  base_type: "type/Integer",
});

const FK = createMockForeignKey({
  origin: createOrdersProductIdField({
    table: ORDERS_TABLE,
  }),
  origin_id: ORDERS.PRODUCT_ID,
  destination_id: PRODUCTS.ID,
});

const DATASET: MockDatasetOpts = {
  data: {
    rows: [[5]],
    cols: [COUNT_COLUMN],
  },
};

const ROW_ID = 123;

interface SetupOpts {
  dataset?: MockDatasetOpts;
  table?: Table;
}

function setup({ dataset = DATASET }: SetupOpts = {}) {
  const onClick = jest.fn();

  const TestComponent = () => (
    <Relationship fk={FK} rowId={ROW_ID} onClick={onClick} />
  );

  setupCardDataset(dataset);

  renderWithProviders(<Route path="/" component={TestComponent} />, {
    withRouter: true,
    storeInitialState: createMockState({
      entities: createMockEntitiesState({
        databases: [createSampleDatabase()],
      }),
    }),
  });

  return { onClick };
}

describe("Relationship", () => {
  it("should render loading state initially", async () => {
    setup();

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("should render clickable count and relationship name when data is loaded", async () => {
    const { onClick } = setup();
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByRole("link")).toBeInTheDocument();
    await userEvent.click(screen.getByText("5"));
    expect(onClick).toHaveBeenCalled();
  });

  it("should render non-clickable zero count when no related records", async () => {
    const { onClick } = setup({
      dataset: {
        data: {
          rows: [[0]],
          cols: [COUNT_COLUMN],
        },
      },
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("0"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should handle empty rows array gracefully", async () => {
    const { onClick } = setup({
      dataset: {
        data: {
          rows: [],
          cols: [COUNT_COLUMN],
        },
      },
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("0"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should handle errors gracefully", async () => {
    const { onClick } = setup();

    fetchMock.modifyRoute("dataset-post", {
      response: { status: 500 },
    });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Unknown"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should render singular relationship names correctly", async () => {
    setup({
      dataset: {
        data: {
          rows: [[1]],
          cols: [COUNT_COLUMN],
        },
      },
    });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Order")).toBeInTheDocument();
    expect(screen.queryByText("Orders")).not.toBeInTheDocument();
  });
});
