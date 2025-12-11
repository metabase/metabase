import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupSchemaEndpoints,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockMeasure,
  createMockTable,
} from "metabase-types/api/mocks";

import { DataModelMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { NewMeasureLayout } from "../../layouts/MeasureLayout";

import { NewMeasurePage } from "./NewMeasurePage";

const TEST_DATABASE = createMockDatabase({
  id: 1,
  name: "Test Database",
});

const TEST_TABLE = createMockTable({
  id: 42,
  db_id: TEST_DATABASE.id,
  db: TEST_DATABASE,
  display_name: "Orders",
  schema: "PUBLIC",
  fields: [
    createMockField({
      id: 1,
      table_id: 42,
      name: "ID",
      display_name: "ID",
      base_type: "type/Integer",
      semantic_type: "type/PK",
    }),
    createMockField({
      id: 2,
      table_id: 42,
      name: "TOTAL",
      display_name: "Total",
      base_type: "type/Float",
      semantic_type: null,
    }),
  ],
});

type SetupOpts = {
  table?: Table;
  hasError?: boolean;
};

function setup({ table = TEST_TABLE, hasError = false }: SetupOpts = {}) {
  if (hasError) {
    fetchMock.get(`path:/api/table/${table.id}/query_metadata`, {
      status: 500,
      body: "Server error",
    });
  } else {
    setupTableQueryMetadataEndpoint(table);
  }

  setupSchemaEndpoints(TEST_DATABASE);

  const successUrl = `/data-studio/data/database/${TEST_DATABASE.id}/schema/${TEST_DATABASE.id}:PUBLIC/table/${table.id}/measures`;

  const { history } = renderWithProviders(
    <Route
      path="/"
      component={() => (
        <NewMeasureLayout
          config={{
            tableId: table.id,
            getSuccessUrl: (measure) => `${successUrl}/${measure.id}`,
            renderBreadcrumbs: (t) => <DataModelMeasureBreadcrumbs table={t} />,
          }}
        >
          <NewMeasurePage route={{ path: "/" } as never} />
        </NewMeasureLayout>
      )}
    />,
    {
      withRouter: true,
    },
  );

  return { history, successUrl };
}

async function addAggregation() {
  await userEvent.click(screen.getByText("Pick an aggregation function"));
  await waitFor(() => {
    expect(screen.getByText("Count")).toBeInTheDocument();
  });
  await userEvent.click(screen.getByText("Count"));
  await waitFor(() => {
    expect(screen.getByText("Count")).toBeInTheDocument();
  });
}

describe("NewMeasurePage", () => {
  it("shows loading state while fetching table metadata", async () => {
    setup();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
  });

  it("shows error state when table fails to load", async () => {
    setup({ hasError: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Server error")).toBeInTheDocument();
  });

  it("renders page with empty form and no Save button", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("new-measure-page")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("New measure")).toHaveValue("");
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("renders aggregation placeholder prompting user to pick an aggregation function", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(
      screen.getByText("Pick an aggregation function"),
    ).toBeInTheDocument();
  });

  it("shows Save button when name is entered", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      screen.getByPlaceholderText("New measure"),
      "Test Measure",
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("shows Save button when description is entered", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      screen.getByLabelText("Description"),
      "Test description",
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("hides Save button when form is cleared back to empty", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const nameInput = screen.getByPlaceholderText("New measure");
    await userEvent.type(nameInput, "Test");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    await userEvent.clear(nameInput);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });
  });

  it("Save button is disabled when name is provided but no aggregation defined", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      screen.getByPlaceholderText("New measure"),
      "Test Measure",
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();
  });

  it("does not show Save when name is whitespace only", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(screen.getByPlaceholderText("New measure"), "   ");

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });
  });

  it("does not show actions menu when no aggregation is defined", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(screen.queryByLabelText("Measure actions")).not.toBeInTheDocument();
  });

  it("shows actions menu with Preview after adding an aggregation", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await addAggregation();

    await userEvent.click(screen.getByLabelText("Measure actions"));
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("enables Save button when name and aggregation are both provided", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      screen.getByPlaceholderText("New measure"),
      "Total Revenue",
    );

    await addAggregation();

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();
  });

  it("calls create API and navigates on successful save", async () => {
    const createdMeasure = createMockMeasure({
      id: 123,
      name: "Total Revenue",
      table_id: TEST_TABLE.id,
    });

    fetchMock.post("path:/api/measure", createdMeasure);

    const { history, successUrl } = setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      screen.getByPlaceholderText("New measure"),
      "Total Revenue",
    );

    await addAggregation();

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();

    await userEvent.click(saveButton);

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls("path:/api/measure");
      expect(calls.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe(
        `${successUrl}/${createdMeasure.id}`,
      );
    });

    expect(screen.getByText("Count")).toBeInTheDocument();
    expect(
      screen.queryByText("Pick an aggregation function"),
    ).not.toBeInTheDocument();
  });
});
