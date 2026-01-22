import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupSchemaEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockTable,
} from "metabase-types/api/mocks";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";

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

type SetupOpts = {
  table?: Table;
};

function setup({ table = TEST_TABLE }: SetupOpts = {}) {
  setupSchemaEndpoints(TEST_DATABASE);

  const successUrl = `/data-studio/data/database/${TEST_DATABASE.id}/schema/${TEST_DATABASE.id}:PUBLIC/table/${table.id}/segments`;

  const getSuccessUrl = (segment: { id: number }) =>
    `${successUrl}/${segment.id}`;

  const { history } = renderWithProviders(
    <Route
      path="/"
      component={() => (
        <NewSegmentPage
          route={{ path: "/" } as never}
          table={table}
          breadcrumbs={<DataModelSegmentBreadcrumbs table={table} />}
          getSuccessUrl={getSuccessUrl}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: {
        entities: createMockEntitiesState({
          databases: [TEST_DATABASE],
          tables: [table],
        }),
      },
    },
  );

  return { history, successUrl };
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
  it("renders page with empty form and no Save button", async () => {
    setup();

    expect(screen.getByTestId("new-segment-page")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("New segment")).toHaveValue("");
    expect(screen.getByLabelText("Give it a description")).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("renders filter placeholder prompting user to add filters", async () => {
    setup();

    expect(
      screen.getByText("Add filters to narrow your answer"),
    ).toBeInTheDocument();
  });

  it("shows Save button when name is entered", async () => {
    setup();

    await userEvent.type(
      screen.getByPlaceholderText("New segment"),
      "Test Segment",
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("shows Save button when description is entered", async () => {
    setup();

    await userEvent.type(
      screen.getByLabelText("Give it a description"),
      "Test description",
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("hides Save button when form is cleared back to empty", async () => {
    setup();

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

    await userEvent.type(
      screen.getByPlaceholderText("New segment"),
      "Test Segment",
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();
  });

  it("does not show Save when name is whitespace only", async () => {
    setup();

    await userEvent.type(screen.getByPlaceholderText("New segment"), "   ");

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });
  });

  it("does not show actions menu when no filters are defined", async () => {
    setup();

    expect(screen.queryByLabelText("Segment actions")).not.toBeInTheDocument();
  });

  it("shows actions menu with Preview after adding a filter", async () => {
    setup();

    await addFilter();

    await userEvent.click(screen.getByLabelText("Segment actions"));
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("enables Save button when name and filter are both provided", async () => {
    setup();

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

    const { history, successUrl } = setup();

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
        `${successUrl}/${createdSegment.id}`,
      );
    });

    expect(screen.getByText(/Total is greater than/)).toBeInTheDocument();
    expect(
      screen.queryByText("Add filters to narrow your answer"),
    ).not.toBeInTheDocument();
  });

  it("does not show discard changes modal after successful save", async () => {
    const createdSegment = createMockSegment({
      id: 123,
      name: "High Value Orders",
      table_id: TEST_TABLE.id,
    });

    fetchMock.post("path:/api/segment", createdSegment);

    const { history, successUrl } = setup();

    await userEvent.type(
      screen.getByPlaceholderText("New segment"),
      "High Value Orders",
    );

    await addFilter();

    const saveButton = screen.getByRole("button", { name: "Save" });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe(
        `${successUrl}/${createdSegment.id}`,
      );
    });

    // The "Discard your changes?" modal should NOT appear after a successful save
    expect(screen.queryByText("Discard your changes?")).not.toBeInTheDocument();
  });
});
