import userEvent from "@testing-library/user-event";
import type { RouteResponse } from "fetch-mock";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { PreviewDatabaseReplicationResponse } from "metabase-enterprise/api/database-replication";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseReplicationModal } from "./DatabaseReplicationModal";

const mockPreviewResponse: PreviewDatabaseReplicationResponse = {
  canSetReplication: true,
  freeQuota: 1000000,
  replicatedTables: [
    { tableName: "users", tableSchema: "public" },
    { tableName: "orders", tableSchema: "public" },
  ],
  tablesWithoutPk: [{ tableName: "logs", tableSchema: "public" }],
  tablesWithoutOwnerMatch: [{ tableName: "temp_data", tableSchema: "staging" }],
  totalEstimatedRowCount: 500000,
};

const setup = async ({
  previewResponse = mockPreviewResponse as RouteResponse,
  createResponse = {} as RouteResponse,
} = {}) => {
  const database = createMockDatabase({ id: 1, name: "Test Database" });

  fetchMock.post(
    `path:/api/ee/database-replication/connection/${database.id}`,
    createResponse,
  );
  fetchMock.post(
    `path:/api/ee/database-replication/connection/${database.id}/preview`,
    previewResponse,
  );

  const view = renderWithProviders(
    <DatabaseReplicationModal
      opened={true}
      onClose={jest.fn()}
      database={database}
    />,
  );

  await waitFor(() => {
    expect(
      fetchMock.callHistory.called(
        `path:/api/ee/database-replication/connection/1/preview`,
        {
          method: "POST",
          body: {
            replicationSchemaFilters: {
              "schema-filters-type": "all",
              "schema-filters-patterns": "",
            },
          },
        },
      ),
    ).toBeTruthy();
  });

  return {
    user: userEvent.setup(),
    view,
  };
};

describe("DatabaseReplicationForm", () => {
  it("renders schema selection options", async () => {
    await setup();

    expect(
      screen.getByLabelText("Select schemas to replicate"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("All")).toBeInTheDocument();
  });

  it("shows textarea only when schema selection is not 'all'", async () => {
    const { user } = await setup();

    // Initially should not show textarea
    expect(
      screen.queryByPlaceholderText("e.g. public, auth"),
    ).not.toBeInTheDocument();

    // Change to "inclusion"
    const select = screen.getByLabelText("Select schemas to replicate");
    await user.click(select);
    await user.click(screen.getByText("Only these…"));

    // Now should show textarea
    expect(
      screen.getByPlaceholderText("e.g. public, auth"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Comma separated names of schemas that should be replicated",
      ),
    ).toBeInTheDocument();
  });

  it("shows correct text for exclusion option", async () => {
    const { user } = await setup();

    const select = screen.getByLabelText("Select schemas to replicate");
    await user.click(select);
    await user.click(screen.getByText("All except…"));

    expect(
      screen.getByText(
        "Comma separated names of schemas that should NOT be replicated",
      ),
    ).toBeInTheDocument();
  });

  it("calls preview with debounced parameters when filters change", async () => {
    const { user } = await setup();

    // Change schema type
    const select = screen.getByLabelText("Select schemas to replicate");
    await user.click(select);
    await user.click(screen.getByText("Only these…"));

    // Type in textarea with debouncing
    const textarea = screen.getByPlaceholderText("e.g. public, auth");
    await user.type(textarea, "public");

    // Should make new API call with updated parameters after debounce
    await waitFor(() => {
      expect(
        fetchMock.callHistory.called(
          `path:/api/ee/database-replication/connection/1/preview`,
          {
            method: "POST",
            body: {
              replicationSchemaFilters: {
                "schema-filters-type": "inclusion",
                "schema-filters-patterns": "public",
              },
            },
          },
        ),
      ).toBeTruthy();
    });
  });

  it("displays table information cards", async () => {
    await setup();

    expect(
      screen.getByText(/Tables without primary key or with owner mismatch/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The following tables will be replicated/),
    ).toBeInTheDocument();
  });

  it("shows storage utilization information", async () => {
    await setup();

    expect(screen.getByText("Test Database")).toBeInTheDocument();
    expect(screen.getByText("Available Cloud Storage")).toBeInTheDocument();
  });

  it("renders DatabaseReplicationError when preview fails", async () => {
    setup({ previewResponse: { status: 500 } });

    await waitFor(() => {
      expect(
        screen.getByText("Couldn't replicate database"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Unknown error")).toBeInTheDocument();
  });

  it("renders DatabaseReplicationError when submit fails", async () => {
    const { user } = await setup({
      createResponse: { status: 400, body: "Replication setup failed" },
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Start replication" }),
      ).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: "Start replication",
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText("Couldn't replicate database"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Replication setup failed")).toBeInTheDocument();
  });

  it("shows invalid schema filters pattern error message", async () => {
    const previewResponseWithError = {
      ...mockPreviewResponse,
      canSetReplication: false,
      errors: {
        invalidSchemaFiltersPattern: true,
      },
    };

    const { user } = await setup({ previewResponse: previewResponseWithError });

    // Change to "inclusion" to show textarea
    const select = screen.getByLabelText("Select schemas to replicate");
    await user.click(select);
    await user.click(screen.getByText("Only these…"));

    // Wait for error message to appear
    await waitFor(() => {
      expect(
        screen.getByText("Invalid schema filters pattern"),
      ).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: "Start replication",
    });
    expect(submitButton).toBeDisabled();
  });

  it("shows nothing to replicate error message", async () => {
    const previewResponseWithError = {
      ...mockPreviewResponse,
      canSetReplication: false,
      errors: {
        noTables: true,
      },
    };

    await setup({ previewResponse: previewResponseWithError });

    await waitFor(() => {
      expect(
        screen.getByText(
          "Nothing to replicate. Please select schemas containing at least one table to be replicated.",
        ),
      ).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: "Start replication",
    });
    expect(submitButton).toBeDisabled();
  });

  it("shows not enough storage error message", async () => {
    const previewResponseWithError = {
      ...mockPreviewResponse,
      canSetReplication: false,
      errors: {
        noQuota: true,
      },
    };

    await setup({ previewResponse: previewResponseWithError });

    await waitFor(() => {
      expect(
        screen.getByText(
          "Not enough storage. Please upgrade your plan or modify the replication scope by excluding schemas.",
        ),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Get more storage")).toBeInTheDocument();
    });

    const submitButton = screen.getByRole("button", {
      name: "Start replication",
    });
    expect(submitButton).toBeDisabled();
  });
});
