import userEvent from "@testing-library/user-event";

import {
  setupClassifyDataSensitivityDatabaseEndpoint,
  setupClassifyDataSensitivityDatabaseEndpointError,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { DataSensitivityDatabaseResult } from "metabase-types/api";
import {
  createMockDataSensitivityCounts,
  createMockDataSensitivityDatabaseResult,
  createMockDataSensitivityFieldResult,
  createMockDataSensitivityTableError,
  createMockDataSensitivityTableResult,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";

import { DataSensitivitySection } from "./DataSensitivitySection";

const DATABASE = createMockDatabase({ id: 1 });

const RESULT: DataSensitivityDatabaseResult =
  createMockDataSensitivityDatabaseResult({
    database_id: DATABASE.id,
    requests: 1,
    failed: 1,
    counts: createMockDataSensitivityCounts({ fields: 2, new: 1, agree: 1 }),
    tables: [
      createMockDataSensitivityTableResult({
        table_id: 10,
        table_name: "PEOPLE",
        fields: [
          createMockDataSensitivityFieldResult({
            field_id: 100,
            name: "EMAIL",
            display_name: "Email",
            proposed: {
              data_sensitivity: "PII",
              confidence: "high",
              semantic_type: null,
              reasoning: "Values look like email addresses.",
            },
            status: "new",
          }),
          createMockDataSensitivityFieldResult({
            field_id: 101,
            name: "ID",
            display_name: "ID",
            current: {
              data_sensitivity: "PUBLIC",
              human_set: false,
              state: "classifier",
              semantic_type: "type/PK",
            },
            proposed: {
              data_sensitivity: "PUBLIC",
              confidence: "high",
              semantic_type: null,
              reasoning: "A surrogate key.",
            },
            status: "agree",
          }),
        ],
      }),
      createMockDataSensitivityTableError({
        table_id: 11,
        table_name: "ORDERS",
        error: "boom",
      }),
    ],
  });

function setup({
  isMetabotEnabled = true,
  isProviderConfigured = true,
}: {
  isMetabotEnabled?: boolean;
  isProviderConfigured?: boolean;
} = {}) {
  setupUserMetabotPermissionsEndpoint();

  renderWithProviders(<DataSensitivitySection database={DATABASE} />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: createMockSettingsState({
        "metabot-enabled?": isMetabotEnabled,
        "llm-metabot-configured?": isProviderConfigured,
      }),
    }),
  });
}

describe("DataSensitivitySection", () => {
  it("runs a scan and shows the results with differences first", async () => {
    setupClassifyDataSensitivityDatabaseEndpoint(DATABASE.id, RESULT);
    setup();

    expect(screen.getByText("Data sensitivity")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Scan for sensitive data" }),
    );

    const modal = await screen.findByTestId("data-sensitivity-results-modal");
    expect(
      within(modal).getByText(
        "2 fields scanned across 1 tables: 1 new, 0 differ from the current label, 1 agree.",
      ),
    ).toBeInTheDocument();
    expect(within(modal).getByText("Email")).toBeInTheDocument();
    expect(within(modal).getByText("Personal information")).toBeInTheDocument();
    expect(within(modal).getByText("New")).toBeInTheDocument();
    expect(within(modal).queryByText("Agrees")).not.toBeInTheDocument();
    expect(within(modal).getByText("ORDERS: boom")).toBeInTheDocument();

    await userEvent.click(
      within(modal).getByLabelText("Only show differences"),
    );
    expect(within(modal).getByText("Agrees")).toBeInTheDocument();

    await userEvent.click(within(modal).getByLabelText("Close"));
    expect(
      screen.getByText(
        "2 fields scanned: 1 new, 0 differ, 1 agree. 1 tables failed.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View results" }));
    expect(
      await screen.findByTestId("data-sensitivity-results-modal"),
    ).toBeInTheDocument();
  });

  it("shows the server's reason when the scan cannot run", async () => {
    setupClassifyDataSensitivityDatabaseEndpointError(DATABASE.id, {
      message: "The AI usage limit has been reached.",
      reason: "usage-limit",
    });
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Scan for sensitive data" }),
    );

    expect(
      await screen.findByText("The AI usage limit has been reached."),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("data-sensitivity-results-modal"),
    ).not.toBeInTheDocument();
  });

  it("disables the scan when Metabot is disabled", () => {
    setup({ isMetabotEnabled: false });

    expect(
      screen.getByRole("button", { name: "Scan for sensitive data" }),
    ).toBeDisabled();
    expect(screen.getByText(/Metabot is disabled/)).toBeInTheDocument();
  });

  it("asks to connect a model when no AI provider is configured", async () => {
    setup({ isProviderConfigured: false });

    expect(
      screen.getByRole("button", { name: "Scan for sensitive data" }),
    ).toBeDisabled();
    expect(
      await screen.findByText(/sensitive data scanning/),
    ).toBeInTheDocument();
  });
});
