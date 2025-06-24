import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import type { Engine } from "metabase-types/api";

import { TEST_ENGINES, setup } from "./setup";

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
          "is-destination-database": false,
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

  it("should not render hidden fields", async () => {
    setup();
    await userEvent.click(screen.getByText("Show advanced options"));
    expect(screen.queryByText("Destination database")).not.toBeInTheDocument();
  });

  it("should allow hidden fields to prevent other fields from being visible", async () => {
    const mockEngines: Record<string, Engine> = {
      ...TEST_ENGINES,
      h2: {
        ...TEST_ENGINES.h2,
        "details-fields":
          TEST_ENGINES.h2["details-fields"]?.map((field) => {
            if (field.name === "is-destination-database") {
              return {
                name: "is-destination-database",
                type: "hidden",
                default: true,
              };
            }

            if (field.name === "let-user-control-scheduling") {
              return {
                name: "let-user-control-scheduling",
                type: "boolean",
                "display-name": "Choose when syncs and scans happen",
                description:
                  "By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, turn this on to make changes.",
                "visible-if": {
                  "advanced-options": true,
                  "is-destination-database": false,
                },
              };
            }

            return field;
          }) || [],
      },
    };
    setup({ engines: mockEngines });
    await userEvent.click(screen.getByText("Show advanced options"));
    expect(screen.queryByText("Destination database")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Choose when syncs and scans happen"),
    ).not.toBeInTheDocument();
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
