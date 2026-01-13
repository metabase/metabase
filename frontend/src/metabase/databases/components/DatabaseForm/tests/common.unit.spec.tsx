import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import type { Engine } from "metabase-types/api";

import * as utils from "../utils";

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

  it("should allow tab navigation through form fields", async () => {
    setup();

    // tabs ou tof the search
    await userEvent.tab();
    // select the first option (H2)
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(screen.getByPlaceholderText("Our H2")).toBeInTheDocument();
  });

  describe("updating existing database", () => {
    it("should mark form as dirty only when actual fields are changed (#66684)", async () => {
      setup({
        initialValues: {
          id: 1,
          name: "My Original H2 Database name",
          details: {
            db: "file:/somewhere",
          },
        },
      });
      const getSaveButton = () =>
        screen.getByRole("button", { name: "Save changes" });
      const getNameInput = () => screen.getByLabelText("Display name");
      const getRefingerprintToggle = () =>
        screen.getByLabelText(/Periodically refingerprint tables/);

      expect(getSaveButton()).toBeDisabled();
      await userEvent.click(screen.getByText("Show advanced options"));
      // Still disabled after opening up advanced options
      await waitFor(() => expect(getSaveButton()).toBeDisabled());

      // Button gets enabled when a field is changed, and disabled again when it is reset
      await userEvent.clear(getNameInput());
      await userEvent.type(getNameInput(), "My updated name");
      await waitFor(() => expect(getSaveButton()).toBeEnabled());

      await userEvent.clear(getNameInput());
      await userEvent.type(getNameInput(), "My Original H2 Database name");
      await waitFor(() => expect(getSaveButton()).toBeDisabled());

      // Check also for a toggle field in advanced options
      await userEvent.click(getRefingerprintToggle());
      await waitFor(() => expect(getSaveButton()).toBeEnabled());
      await userEvent.click(getRefingerprintToggle());
      await waitFor(() => expect(getSaveButton()).toBeDisabled());
    });
  });
});

describe("DatabaseForm with provider name", () => {
  it("submits provider name", async () => {
    const { onSubmit } = setup({
      initialValues: {
        engine: "postgres",
      },
    });

    const connectionString =
      "jdbc:postgresql://user:pass@pooler.ap-southeast-1.aws.neon.tech:5432/mydb";
    await userEvent.type(
      screen.getByLabelText("Connection string (optional)"),
      connectionString,
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await userEvent.click(saveButton);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_name: "Neon",
        }),
      );
    });
  });

  it("submits empty provider name if not matched", async () => {
    const { onSubmit } = setup({
      initialValues: {
        engine: "postgres",
      },
    });

    const connectionString = "jdbc:postgresql://user:pass@localhost:5432/mydb";
    await userEvent.type(
      screen.getByLabelText("Connection string (optional)"),
      connectionString,
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await userEvent.click(saveButton);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_name: null,
        }),
      );
    });
  });

  describe("Connection error handling", () => {
    const errorHandlingSetup = ({ isAdvanced }: { isAdvanced?: boolean }) => {
      setup({
        engines: TEST_ENGINES,
        isAdvanced,
      });
    };
    const errorMessage = /Metabase tried, but couldn't connect/;

    beforeEach(() => {
      jest.spyOn(utils, "useHasConnectionError").mockImplementation(() => true);
    });

    it("shows error message in the footer if isAdvanced is false (setup page)", () => {
      errorHandlingSetup({ isAdvanced: false });
      // Check error is rendered in the footer
      expect(
        within(screen.getByTestId("form-footer")).getByText(errorMessage),
      ).toBeInTheDocument();
    });

    it("shows error message outside the footer if isAdvanced is true (admin page)", () => {
      errorHandlingSetup({ isAdvanced: true });
      // Check error is rendered
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      // But not in the footer
      expect(
        within(screen.getByTestId("form-footer")).queryByText(errorMessage),
      ).not.toBeInTheDocument();
    });
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
  provider_name: null,
};
