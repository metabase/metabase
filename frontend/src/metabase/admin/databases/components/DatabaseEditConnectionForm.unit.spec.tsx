import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupEnginesEndpoint,
  setupUpdateDatabaseEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { TEST_ENGINES } from "metabase/databases/components/DatabaseForm/tests/setup";
import { Route } from "metabase/router";
import type { DatabaseData, Engine } from "metabase-types/api";
import {
  createMockDatabase,
  createMockEngines,
} from "metabase-types/api/mocks";

import { DatabaseEditConnectionForm } from "./DatabaseEditConnectionForm";

interface SetupOpts {
  database?: Partial<DatabaseData>;
  engines?: Record<string, Engine>;
  isAttachedDWH?: boolean;
}

function setup({
  database,
  engines = createMockEngines(),
  isAttachedDWH = false,
}: SetupOpts = {}) {
  setupEnginesEndpoint(engines);

  const storeInitialState = createMockState();

  renderWithProviders(
    <Route
      path="/"
      element={
        <DatabaseEditConnectionForm
          database={database}
          isAttachedDWH={isAttachedDWH}
          onSubmitted={jest.fn()}
          onCancel={jest.fn()}
          formLocation="admin"
        />
      }
    />,
    { withRouter: true, storeInitialState },
  );
}

describe("DatabaseEditConnectionForm", () => {
  it("renders the editable connection form for an ordinary database", async () => {
    setup({ database: { id: 1, engine: "postgres" } });

    expect(await screen.findByTestId("database-form")).toBeInTheDocument();
    expect(screen.queryByText(/cannot be edited/i)).not.toBeInTheDocument();
  });

  it("replaces the form with an explanation for the sample database", () => {
    setup({ database: { id: 1, is_sample: true, engine: "postgres" } });

    expect(screen.queryByTestId("database-form")).not.toBeInTheDocument();
    expect(
      screen.getByText("The sample database cannot be edited."),
    ).toBeInTheDocument();
  });

  it("replaces the form with an explanation for an attached DWH", () => {
    setup({ database: { id: 1, engine: "postgres" }, isAttachedDWH: true });

    expect(screen.queryByTestId("database-form")).not.toBeInTheDocument();
    expect(
      screen.getByText(/managed by Metabase Cloud and cannot be modified/i),
    ).toBeInTheDocument();
  });

  it("sends only the scan-only-used-field-values setting in the update request when the scan mode changes", async () => {
    const database = createMockDatabase({
      id: 1,
      engine: "h2",
      details: {
        db: "file:/somewhere",
        "let-user-control-scheduling": true,
      },
      is_full_sync: true,
      is_on_demand: false,
      schedules: {
        cache_field_values: { schedule_type: "weekly", schedule_day: "tue" },
      },
      settings: { "database-enable-actions": true },
    });
    const updatePath = `path:/api/database/${database.id}`;
    setupUpdateDatabaseEndpoint(database);
    setup({ database, engines: TEST_ENGINES });

    await userEvent.click(await screen.findByText("Show advanced options"));
    await userEvent.click(
      await screen.findByDisplayValue("Regularly, on a schedule"),
    );
    await userEvent.click(
      within(await screen.findByRole("listbox")).getByText(
        "Regularly, on a schedule, only for filters people used",
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory.calls(updatePath, { method: "PUT" }),
      ).toHaveLength(1);
    });
    const updateCall = fetchMock.callHistory.lastCall(updatePath, {
      method: "PUT",
    });
    const requestBody: unknown = JSON.parse(String(updateCall?.options.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        is_full_sync: true,
        is_on_demand: false,
        settings: { "scan-only-used-field-values": true },
        schedules: expect.objectContaining({
          cache_field_values: expect.objectContaining({
            schedule_type: "weekly",
            schedule_day: "tue",
          }),
        }),
      }),
    );
  });
});
