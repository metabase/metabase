import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";

import { setup } from "./setup";

describe("DatabaseForm", () => {
  it("should submit default values", async () => {
    const { onSubmit } = setup();

    const expectedDatabaseName = "My H2 Database";
    const expectedConnectionString = "file:/somewhere";
    await userEvent.type(
      screen.getByLabelText("Display name"),
      expectedDatabaseName,
    );
    await userEvent.type(
      screen.getByLabelText("Connection String"),
      expectedConnectionString,
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveButton).toBeEnabled());

    await userEvent.click(saveButton);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        ...EXPECTED_DEFAULT_SCHEMA,
        engine: "h2",
        name: expectedDatabaseName,
        details: {
          "advanced-options": false,
          db: expectedConnectionString,
        },
      });
    });
  });

  it("should not allow to configure cache ttl", async () => {
    setup();
    await userEvent.click(screen.getByText("Show advanced options"));
    expect(
      screen.getByText("Choose when syncs and scans happen"),
    ).toBeInTheDocument();
  });
});

const EXPECTED_DEFAULT_SCHEMA = {
  schedules: {
    metadata_sync: undefined,
    cache_field_values: undefined,
  },
  auto_run_queries: true,
  refingerprint: false,
  cache_ttl: null,
  is_sample: false,
  is_full_sync: true,
  is_on_demand: false,
};
