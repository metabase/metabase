import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupSchemaEndpoints,
  setupSegmentEndpoint,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { Segment, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockStructuredDatasetQuery,
  createMockTable,
} from "metabase-types/api/mocks";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";
import { ExistingSegmentLayout } from "../../layouts/SegmentLayout";

import { SegmentDetailPage } from "./SegmentDetailPage";

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

const TEST_SEGMENT = createMockSegment({
  id: 1,
  name: "High Value Orders",
  description: "Orders with total > 100",
  table_id: TEST_TABLE.id,
  definition: createMockStructuredDatasetQuery({
    database: TEST_DATABASE.id,
    query: {
      "source-table": TEST_TABLE.id,
      filter: [">", ["field", 2, null], 100],
    },
  }),
});

type SetupOpts = {
  segment?: Segment;
  table?: Table;
  hasSegmentError?: boolean;
  hasTableError?: boolean;
};

function setup({
  segment = TEST_SEGMENT,
  table = TEST_TABLE,
  hasSegmentError = false,
  hasTableError = false,
}: SetupOpts = {}) {
  if (hasSegmentError) {
    fetchMock.get(`path:/api/segment/${segment.id}`, {
      status: 500,
      body: "Segment not found",
    });
  } else {
    setupSegmentEndpoint(segment);
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

  const baseUrl = `/data-studio/data/database/${TEST_DATABASE.id}/schema/${TEST_DATABASE.id}:PUBLIC/table/${table.id}/segments/${segment.id}`;

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <ExistingSegmentLayout
          config={{
            segmentId: segment.id,
            backUrl: `/data-studio/data/database/${TEST_DATABASE.id}/schema/${TEST_DATABASE.id}:PUBLIC/table/${table.id}/segments`,
            tabUrls: {
              definition: baseUrl,
              revisions: `${baseUrl}/revisions`,
              dependencies: `${baseUrl}/dependencies`,
            },
            renderBreadcrumbs: (t, s) => (
              <DataModelSegmentBreadcrumbs table={t} segment={s} />
            ),
          }}
        >
          <SegmentDetailPage route={{ path: "/" } as never} />
        </ExistingSegmentLayout>
      )}
    />,
    {
      withRouter: true,
    },
  );
}

describe("SegmentDetailPage", () => {
  it("shows loading state while fetching segment and table", async () => {
    setup();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
  });

  it("shows error state when segment fails to load", async () => {
    setup({ hasSegmentError: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Segment not found")).toBeInTheDocument();
  });

  it("shows error state when table fails to load", async () => {
    setup({ hasTableError: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Table not found")).toBeInTheDocument();
  });

  it("renders page with segment data, tabs, and actions menu", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(screen.getByDisplayValue("High Value Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Orders with total > 100",
    );
    expect(screen.getByText("Definition")).toBeInTheDocument();
    expect(screen.getByText("Revision history")).toBeInTheDocument();
    expect(screen.getByLabelText("Segment actions")).toBeInTheDocument();
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

    expect(descriptionInput).toHaveValue("Orders with total > 100");
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("calls update API and preserves form state after successful save", async () => {
    const updatedSegment = {
      ...TEST_SEGMENT,
      description: "Updated description",
    };

    fetchMock.put(`path:/api/segment/${TEST_SEGMENT.id}`, updatedSegment);

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
        `path:/api/segment/${TEST_SEGMENT.id}`,
      );
      expect(calls.length).toBeGreaterThan(0);
    });

    expect(descriptionInput).toHaveValue("Updated description");
    expect(screen.getByText(/Total is greater than/)).toBeInTheDocument();
  });

  it("displays existing filter from segment definition", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(screen.getByText(/Total is greater than/)).toBeInTheDocument();
  });

  it("opens actions menu with Preview and Remove options when clicking menu button", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByLabelText("Segment actions"));

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Remove segment")).toBeInTheDocument();
  });

  it("shows confirmation modal when Remove segment is clicked", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByLabelText("Segment actions"));
    await userEvent.click(screen.getByText("Remove segment"));

    expect(screen.getByText("Remove this segment?")).toBeInTheDocument();
    expect(
      screen.getByText("This segment will be permanently removed."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});
