import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupSchemaEndpoints,
  setupSegmentEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import type { EnterpriseSettings, Segment, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockSegment,
  createMockStructuredDatasetQuery,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { DataModelSegmentBreadcrumbs } from "../../components/SegmentBreadcrumbs";

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
  isAdmin?: boolean;
  remoteSyncType?: EnterpriseSettings["remote-sync-type"];
};

function setup({
  segment = TEST_SEGMENT,
  table = TEST_TABLE,
  isAdmin = true,
  remoteSyncType,
}: SetupOpts = {}) {
  setupSegmentEndpoint(segment);
  setupSchemaEndpoints(checkNotNull(table.db));

  const baseUrl = `/data-studio/data/database/${TEST_DATABASE.id}/schema/${TEST_DATABASE.id}:PUBLIC/table/${table.id}/segments/${segment.id}`;

  const tabUrls = {
    definition: baseUrl,
    revisions: `${baseUrl}/revisions`,
    dependencies: `${baseUrl}/dependencies`,
  };

  const onRemove = jest.fn().mockResolvedValue(undefined);

  renderWithProviders(
    <Route
      path="/"
      component={() => (
        <SegmentDetailPage
          route={{ path: "/" } as never}
          segment={segment}
          tabUrls={tabUrls}
          breadcrumbs={
            <DataModelSegmentBreadcrumbs table={table} segment={segment} />
          }
          onRemove={onRemove}
        />
      )}
    />,
    {
      withRouter: true,
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: isAdmin }),
        entities: createMockEntitiesState({
          databases: [TEST_DATABASE],
          tables: [table],
        }),
        settings: mockSettings({
          "remote-sync-type": remoteSyncType,
          "remote-sync-enabled": !!remoteSyncType,
        }),
      },
    },
  );

  return { onRemove };
}

describe("SegmentDetailPage", () => {
  it("renders page with segment data, tabs, and actions menu", async () => {
    setup();

    expect(screen.getByDisplayValue("High Value Orders")).toBeInTheDocument();
    expect(screen.getByLabelText("Give it a description")).toHaveValue(
      "Orders with total > 100",
    );
    expect(screen.getByText("Definition")).toBeInTheDocument();
    expect(screen.getByText("Revision history")).toBeInTheDocument();
    expect(screen.getByLabelText("Segment actions")).toBeInTheDocument();
  });

  it("does not show Save/Cancel buttons when form is pristine", async () => {
    setup();

    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  it("shows Save/Cancel buttons when description is modified", async () => {
    setup();

    const descriptionInput = screen.getByLabelText("Give it a description");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "New description");

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("resets form when Cancel is clicked after modifying description", async () => {
    setup();

    const descriptionInput = screen.getByLabelText("Give it a description");
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

    const descriptionInput = screen.getByLabelText("Give it a description");
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
    await waitFor(() => {
      expect(screen.getByText(/Total is greater than/)).toBeInTheDocument();
    });
  });

  it("displays existing filter from segment definition", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText(/Total is greater than/)).toBeInTheDocument();
    });
  });

  it("opens actions menu with Preview and Remove options when clicking menu button", async () => {
    setup();

    await userEvent.click(screen.getByLabelText("Segment actions"));

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Remove segment")).toBeInTheDocument();
  });

  it("shows confirmation modal when Remove segment is clicked", async () => {
    setup();

    await userEvent.click(screen.getByLabelText("Segment actions"));
    await userEvent.click(screen.getByText("Remove segment"));

    expect(screen.getByText("Remove this segment?")).toBeInTheDocument();
    expect(
      screen.getByText("This segment will be permanently removed."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  describe("readonly state for non-admin users", () => {
    it("has readonly segment name input", async () => {
      setup({ isAdmin: false });

      const nameInput = screen.getByDisplayValue("High Value Orders");
      expect(nameInput).toBeDisabled();
    });

    it("shows description as plain text", async () => {
      setup({ isAdmin: false });

      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByText("Orders with total > 100")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Give it a description"),
      ).not.toBeInTheDocument();
    });

    it("hides description section when there is no description", async () => {
      setup({
        isAdmin: false,
        segment: createMockSegment({ ...TEST_SEGMENT, description: "" }),
      });

      expect(screen.queryByText("Description")).not.toBeInTheDocument();
    });

    it("does not show Remove segment option in actions menu", async () => {
      setup({ isAdmin: false });

      await userEvent.click(screen.getByLabelText("Segment actions"));

      expect(screen.getByText("Preview")).toBeInTheDocument();
      expect(screen.queryByText("Remove segment")).not.toBeInTheDocument();
    });

    it("does not show Save/Cancel buttons", async () => {
      setup({ isAdmin: false });

      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("readonly state", () => {
    describe("when remote sync is read-only and table is published", () => {
      beforeEach(() => {
        setup({
          remoteSyncType: "read-only",
          table: { ...TEST_TABLE, is_published: true },
        });
      });

      it("has readonly segment name input", async () => {
        const nameInput = screen.getByDisplayValue("High Value Orders");
        expect(nameInput).toBeDisabled();
      });

      it("shows description as plain text", async () => {
        expect(screen.getByText("Description")).toBeInTheDocument();
        expect(screen.getByText("Orders with total > 100")).toBeInTheDocument();
        expect(
          screen.queryByLabelText("Give it a description"),
        ).not.toBeInTheDocument();
      });

      it("does not show Remove segment option in actions menu", async () => {
        await userEvent.click(screen.getByLabelText("Segment actions"));

        expect(
          screen.getByRole("menuitem", { name: /Preview/ }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("menuitem", { name: /Remove segment/ }),
        ).not.toBeInTheDocument();
      });
    });

    describe("when remote sync is read-only and table is not published", () => {
      it("does not show elements as read-only", async () => {
        setup({
          remoteSyncType: "read-only",
          table: { ...TEST_TABLE, is_published: false },
        });

        expect(screen.getByDisplayValue("High Value Orders")).toBeEnabled();
        expect(screen.getByLabelText("Give it a description")).toBeEnabled();

        await userEvent.click(screen.getByLabelText("Segment actions"));

        expect(
          screen.getByRole("menuitem", { name: /Remove segment/ }),
        ).toBeInTheDocument();
      });
    });
  });
});
