import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupTableQueryMetadataEndpoint } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Segment, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

import { NewSegmentPage } from "./NewSegmentPage";

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

const mockRoute = {
  path: "/data-studio/library/segments/new",
} as any;

const mockGetSuccessUrl = (segment: Segment) =>
  `/data-studio/library/segments/${segment.id}`;

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

  const { history } = renderWithProviders(
    <Route
      path="/"
      component={() => (
        <NewSegmentPage
          tableId={table.id}
          getSuccessUrl={mockGetSuccessUrl}
          renderBreadcrumbs={(t) => (
            <div data-testid="breadcrumbs">Table: {t.display_name}</div>
          )}
          route={mockRoute}
        />
      )}
    />,
    { withRouter: true },
  );

  return { history };
}

async function addFilter() {
  await userEvent.click(screen.getByText("Add filters to narrow your answer"));
  await waitFor(() => {
    expect(screen.getByText("Total")).toBeInTheDocument();
  });
  await userEvent.click(screen.getByText("Total"));
  await waitFor(() => {
    expect(screen.getByPlaceholderText("Min")).toBeInTheDocument();
  });
  await userEvent.type(screen.getByPlaceholderText("Min"), "100");
  await userEvent.click(screen.getByText("Add filter"));
  await waitFor(() => {
    expect(screen.getByText(/Total is greater than/)).toBeInTheDocument();
  });
}

describe("NewSegmentPage", () => {
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

  it("renders page with empty form, breadcrumbs, and no Save button", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("new-segment-page")).toBeInTheDocument();
    expect(screen.getByTestId("breadcrumbs")).toHaveTextContent(
      "Table: Orders",
    );
    expect(screen.getByPlaceholderText("New segment")).toHaveValue("");
    expect(screen.getByLabelText("Description")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("renders filter placeholder prompting user to add filters", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(
      screen.getByText("Add filters to narrow your answer"),
    ).toBeInTheDocument();
  });

  it("shows Save button when name is entered", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      screen.getByPlaceholderText("New segment"),
      "Test Segment",
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

    const nameInput = screen.getByPlaceholderText("New segment");
    await userEvent.type(nameInput, "Test");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    await userEvent.clear(nameInput);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });
  });

  it("Save button is disabled when name is provided but no filters defined", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      screen.getByPlaceholderText("New segment"),
      "Test Segment",
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();
  });

  it("does not show Save when name is whitespace only", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(screen.getByPlaceholderText("New segment"), "   ");

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });
  });

  it("does not show actions menu when no filters are defined", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(screen.queryByLabelText("Segment actions")).not.toBeInTheDocument();
  });

  it("shows actions menu with Preview after adding a filter", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await addFilter();

    await userEvent.click(screen.getByLabelText("Segment actions"));
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("enables Save button when name and filter are both provided", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      screen.getByPlaceholderText("New segment"),
      "High Value Orders",
    );

    await addFilter();

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();
  });

  it("calls create API and navigates on successful save", async () => {
    const createdSegment = createMockSegment({
      id: 123,
      name: "High Value Orders",
      table_id: TEST_TABLE.id,
    });

    fetchMock.post("path:/api/segment", createdSegment);

    const { history } = setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      screen.getByPlaceholderText("New segment"),
      "High Value Orders",
    );

    await addFilter();

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();

    await userEvent.click(saveButton);

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls("path:/api/segment");
      expect(calls.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe(
        "/data-studio/library/segments/123",
      );
    });

    expect(screen.getByText(/Total is greater than/)).toBeInTheDocument();
    expect(
      screen.queryByText("Add filters to narrow your answer"),
    ).not.toBeInTheDocument();
  });
});
