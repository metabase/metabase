import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupMeasureEndpoint,
  setupSchemaEndpoints,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { Measure, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockMeasure,
  createMockStructuredDatasetQuery,
  createMockTable,
} from "metabase-types/api/mocks";

import { DataModelMeasureBreadcrumbs } from "../../components/MeasureBreadcrumbs";
import { ExistingMeasureLayout } from "../../layouts/MeasureLayout";

import { MeasureDetailPage } from "./MeasureDetailPage";

const TEST_TABLE = createMockTable({
  id: 42,
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

const TEST_DATABASE = createMockDatabase({
  id: 1,
  name: "Test Database",
});

TEST_TABLE.db_id = TEST_DATABASE.id;
TEST_TABLE.db = TEST_DATABASE;

const TEST_MEASURE = createMockMeasure({
  id: 1,
  name: "Total Revenue",
  description: "Sum of all order totals",
  table_id: TEST_TABLE.id,
  definition: createMockStructuredDatasetQuery({
    database: TEST_DATABASE.id,
    query: {
      "source-table": TEST_TABLE.id,
      aggregation: [["sum", ["field", 2, null]]],
    },
  }),
});

type SetupOpts = {
  measure?: Measure;
  table?: Table;
  hasMeasureError?: boolean;
  hasTableError?: boolean;
};

function setup({
  measure = TEST_MEASURE,
  table = TEST_TABLE,
  hasMeasureError = false,
  hasTableError = false,
}: SetupOpts = {}) {
  if (hasMeasureError) {
    fetchMock.get(`path:/api/measure/${measure.id}`, {
      status: 500,
      body: "Measure not found",
    });
  } else {
    setupMeasureEndpoint(measure);
  }

  if (hasTableError) {
    fetchMock.get(`path:/api/table/${table.id}/query_metadata`, {
      status: 500,
      body: "Table not found",
    });
  } else {
    setupTableQueryMetadataEndpoint(table);
  }

  setupSchemaEndpoints(checkNotNull(table.db));

  const baseUrl = `/data-studio/data/database/${TEST_DATABASE.id}/schema/${TEST_DATABASE.id}:PUBLIC/table/${table.id}/measures/${measure.id}`;

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <ExistingMeasureLayout
          config={{
            measureId: measure.id,
            backUrl: `/data-studio/data/database/${TEST_DATABASE.id}/schema/${TEST_DATABASE.id}:PUBLIC/table/${table.id}/measures`,
            tabUrls: {
              definition: baseUrl,
              revisions: `${baseUrl}/revisions`,
              dependencies: `${baseUrl}/dependencies`,
            },
            renderBreadcrumbs: (t, m) => (
              <DataModelMeasureBreadcrumbs table={t} measure={m} />
            ),
          }}
        >
          <MeasureDetailPage route={{ path: "/" } as never} />
        </ExistingMeasureLayout>
      )}
    />,
    {
      withRouter: true,
    },
  );
}

describe("MeasureDetailPage", () => {
  it("shows loading state while fetching measure and table", async () => {
    setup();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
  });

  it("shows error state when measure fails to load", async () => {
    setup({ hasMeasureError: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Measure not found")).toBeInTheDocument();
  });

  it("shows error state when table fails to load", async () => {
    setup({ hasTableError: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Table not found")).toBeInTheDocument();
  });

  it("renders page with measure data, tabs, and actions menu", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(screen.getByDisplayValue("Total Revenue")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Sum of all order totals",
    );
    expect(screen.getByText("Definition")).toBeInTheDocument();
    expect(screen.getByText("Revision history")).toBeInTheDocument();
    expect(screen.getByLabelText("Measure actions")).toBeInTheDocument();
  });

  it("does not show Save/Cancel buttons when form is pristine", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("shows Save/Cancel buttons when description is modified", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const descriptionInput = screen.getByLabelText("Description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "New description");

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("resets form when Cancel is clicked after modifying description", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const descriptionInput = screen.getByLabelText("Description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Modified description");
    expect(descriptionInput).toHaveValue("Modified description");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(descriptionInput).toHaveValue("Sum of all order totals");
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("calls update API and preserves form state after successful save", async () => {
    const updatedMeasure = {
      ...TEST_MEASURE,
      description: "Updated description",
    };

    fetchMock.put(`path:/api/measure/${TEST_MEASURE.id}`, updatedMeasure);

    setup();
    await waitForLoaderToBeRemoved();

    const descriptionInput = screen.getByLabelText("Description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Updated description");

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();

    await userEvent.click(saveButton);

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls(
        `path:/api/measure/${TEST_MEASURE.id}`,
      );
      expect(calls.length).toBeGreaterThan(0);
    });

    expect(descriptionInput).toHaveValue("Updated description");
  });

  it("displays existing aggregation from measure definition", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(screen.getByText(/Sum of/)).toBeInTheDocument();
  });

  it("opens actions menu with Preview and Remove options when clicking menu button", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByLabelText("Measure actions"));

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Remove measure")).toBeInTheDocument();
  });

  it("shows confirmation modal when Remove measure is clicked", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByLabelText("Measure actions"));
    await userEvent.click(screen.getByText("Remove measure"));

    expect(screen.getByText("Remove this measure?")).toBeInTheDocument();
    expect(
      screen.getByText("This measure will be permanently removed."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});
