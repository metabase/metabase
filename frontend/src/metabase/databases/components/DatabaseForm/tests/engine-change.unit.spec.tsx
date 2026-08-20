import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { DatabaseData, Engine } from "metabase-types/api";

import { DatabaseForm } from "../DatabaseForm";

import { mysqlFormConfig } from "./mysql-form-config.mock";
import { TEST_ENGINES, setup } from "./setup";

const ENGINES: Record<string, Engine> = {
  ...TEST_ENGINES,
  mysql: mysqlFormConfig,
};

const selectDatabaseType = async (driverName: string) => {
  await userEvent.click(screen.getByLabelText("Database type"));
  await userEvent.click(
    await screen.findByRole("option", { name: driverName }),
  );
  expect(await screen.findByDisplayValue(driverName)).toBeInTheDocument();
};

describe("DatabaseForm engine change", () => {
  it("should keep the values that already have been entered (metabase#74569)", async () => {
    setup({ engines: ENGINES, initialValues: { engine: "postgres" } });

    await userEvent.type(screen.getByLabelText("Display name"), "My database");
    await userEvent.type(screen.getByLabelText("Host"), "localhost");
    await userEvent.type(screen.getByLabelText("Database name"), "birds");
    await userEvent.type(screen.getByLabelText("Username"), "bird-watcher");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2");

    await selectDatabaseType("MySQL");

    expect(screen.getByLabelText("Display name")).toHaveValue("My database");
    expect(screen.getByLabelText("Host")).toHaveValue("localhost");
    expect(screen.getByLabelText("Database name")).toHaveValue("birds");
    expect(screen.getByLabelText("Username")).toHaveValue("bird-watcher");
    expect(screen.getByLabelText("Password")).toHaveValue("hunter2");
  });

  it("should submit the values that were entered before the engine changed (metabase#74569)", async () => {
    const { onSubmit } = setup({
      engines: ENGINES,
      initialValues: { engine: "postgres" },
    });

    await userEvent.type(screen.getByLabelText("Display name"), "My database");
    await userEvent.type(screen.getByLabelText("Host"), "localhost");
    await userEvent.type(screen.getByLabelText("Database name"), "birds");
    await userEvent.type(screen.getByLabelText("Username"), "bird-watcher");

    await selectDatabaseType("MySQL");

    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: "mysql",
          name: "My database",
          details: expect.objectContaining({
            host: "localhost",
            dbname: "birds",
            user: "bird-watcher",
            ssl: false,
          }),
        }),
      );
    });
  });

  it("should discard the details that the newly selected engine does not have", async () => {
    setup({ engines: ENGINES, initialValues: { engine: "postgres" } });

    await userEvent.type(screen.getByLabelText("Host"), "localhost");

    await selectDatabaseType("H2");

    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Connection String")).toHaveValue("");
  });

  it("should follow the engine of the initial data when it arrives after the first render", async () => {
    // the edit page renders the form before the database record has loaded
    const LateLoadingForm = () => {
      const [initialValues, setInitialValues] = useState<Partial<DatabaseData>>(
        {},
      );
      const load = () =>
        setInitialValues({
          engine: "mysql",
          name: "Loaded database",
          details: { host: "db.example.com", dbname: "birds" },
        });

      return (
        <>
          <button onClick={load}>Load</button>
          <DatabaseForm
            initialValues={initialValues}
            config={{ isAdvanced: true }}
            location="admin"
          />
        </>
      );
    };

    renderWithProviders(<LateLoadingForm />, {
      storeInitialState: createMockState({
        settings: mockSettings({ engines: ENGINES }),
      }),
    });

    expect(await screen.findByDisplayValue("PostgreSQL")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Load" }));

    expect(await screen.findByDisplayValue("MySQL")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue(
      "Loaded database",
    );
    expect(screen.getByLabelText("Host")).toHaveValue("db.example.com");
    expect(screen.getByLabelText("Database name")).toHaveValue("birds");
  });

  it("should discard the connection string, which is engine specific", async () => {
    setup({ engines: ENGINES, initialValues: { engine: "postgres" } });

    const connectionStringInput = () =>
      screen.getByLabelText("Connection string (optional)");

    await userEvent.type(
      connectionStringInput(),
      "jdbc:postgresql://user:pass@localhost:5432/mydb",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Database name")).toHaveValue("mydb"),
    );

    await selectDatabaseType("MySQL");

    expect(connectionStringInput()).toHaveValue("");
    // the details it pre-filled are still kept, only the string itself is reset
    expect(screen.getByLabelText("Database name")).toHaveValue("mydb");
  });
});
