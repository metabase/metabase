import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { PreviewDatabaseReplicationResponse } from "metabase-enterprise/api/database-replication";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseReplicationForm } from "./DatabaseReplicationForm";

const mockPreviewResponse: PreviewDatabaseReplicationResponse = {
  allQuotas: [],
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

const setup = ({
  onSubmit = jest.fn(),
  preview = jest.fn(),
  initialValues = {
    databaseId: 1,
    schemaFiltersType: "all" as const,
    schemaFiltersPatterns: "",
  },
  previewResponse = mockPreviewResponse,
} = {}) => {
  const database = createMockDatabase({ id: 1, name: "Test Database" });

  // Mock the preview function to simulate API response
  const mockPreview = jest.fn((fields, handleResponse) => {
    // Use setTimeout to simulate async behavior but with immediate resolution
    setTimeout(() => handleResponse(previewResponse), 0);
  });

  const previewFn = jest.isMockFunction(preview) ? preview : mockPreview;

  return {
    user: userEvent.setup(),
    onSubmit,
    preview: previewFn,
    ...renderWithProviders(
      <DatabaseReplicationForm
        database={database}
        onSubmit={onSubmit}
        preview={previewFn}
        initialValues={initialValues}
      />,
    ),
  };
};

describe("DatabaseReplicationForm", () => {
  it("renders schema selection options", () => {
    setup();

    expect(
      screen.getByLabelText("Select schemas to replicate"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("All")).toBeInTheDocument();
  });

  it("shows textarea only when schema selection is not 'all'", async () => {
    const { user } = setup();

    // Initially should not show textarea
    expect(
      screen.queryByPlaceholderText("e.g. public, auth"),
    ).not.toBeInTheDocument();

    // Change to "include"
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

  it("shows correct text for exclude option", async () => {
    const { user } = setup();

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
    const mockPreview = jest.fn((fields, handleResponse) => {
      handleResponse(mockPreviewResponse);
    });
    const { user } = setup({ preview: mockPreview });

    // Initial call should happen
    await waitFor(() => {
      expect(mockPreview).toHaveBeenCalledWith(
        {
          databaseId: 1,
          schemaFiltersType: "all",
          schemaFiltersPatterns: "",
        },
        expect.any(Function),
        expect.any(Function),
      );
    });

    // Change schema type
    const select = screen.getByLabelText("Select schemas to replicate");
    await user.click(select);
    await user.click(screen.getByText("Only these…"));

    // Type in textarea with debouncing
    const textarea = screen.getByPlaceholderText("e.g. public, auth");
    await user.type(textarea, "public");

    // Should call preview with new parameters after debounce
    await waitFor(
      () => {
        expect(mockPreview).toHaveBeenCalledWith(
          {
            databaseId: 1,
            schemaFiltersType: "include",
            schemaFiltersPatterns: "public",
          },
          expect.any(Function),
          expect.any(Function),
        );
      },
      { timeout: 2000 },
    );
  });

  it("disables submit when insufficient storage", () => {
    const previewResponse = {
      ...mockPreviewResponse,
      canSetReplication: false,
    };
    setup({ previewResponse });

    const submitButton = screen.getByRole("button", {
      name: "Start replication",
    });
    expect(submitButton).toBeDisabled();
  });

  it("calls preview function with initial values", () => {
    const mockPreview = jest.fn();
    setup({ preview: mockPreview });

    expect(mockPreview).toHaveBeenCalledWith(
      {
        databaseId: 1,
        schemaFiltersType: "all",
        schemaFiltersPatterns: "",
      },
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("displays table information cards", () => {
    setup();

    expect(
      screen.getByText(/Tables without primary key or with owner mismatch/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The following tables will be replicated/),
    ).toBeInTheDocument();
  });

  it("shows storage utilization information", () => {
    setup();

    expect(screen.getByText("Test Database")).toBeInTheDocument();
    expect(screen.getByText("Available Cloud Storage")).toBeInTheDocument();
  });

  it("calls preview function on mount", () => {
    const mockPreview = jest.fn();
    setup({ preview: mockPreview });

    // Should call preview function at least once
    expect(mockPreview).toHaveBeenCalled();
  });
});
