import userEvent from "@testing-library/user-event";

import { screen, waitFor } from "__support__/ui";
import { trackSimpleEvent } from "metabase/analytics";
import type { Engine } from "metabase-types/api";

import { mysqlFormConfig } from "./mysql-form-config.mock";
import { TEST_ENGINES, setup } from "./setup";

const ENGINES: Record<string, Engine> = {
  ...TEST_ENGINES,
  mysql: mysqlFormConfig,
};

const MYSQL_CONNECTION_STRING =
  "jdbc:mysql://testuser:testpass@host:3306/dbname?ssl=true";

const getConnectionStringField = () =>
  screen.getByLabelText("Connection string (optional)");

const pasteConnectionString = async (connectionString: string) => {
  await userEvent.click(getConnectionStringField());
  await userEvent.paste(connectionString);
};

describe("DatabaseForm connection string", () => {
  it("should enable Save once a valid connection string pre-fills the required fields", async () => {
    const { onSubmit } = await setup({
      engines: ENGINES,
      initialValues: { engine: "mysql" },
    });

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    await pasteConnectionString(MYSQL_CONNECTION_STRING);

    expect(
      await screen.findByText("Connection details pre-filled below."),
    ).toBeInTheDocument();
    await waitFor(() => expect(saveButton).toBeEnabled());

    expect(screen.getByLabelText("Host")).toHaveValue("host");
    expect(screen.getByLabelText("Port")).toHaveValue("3306");
    expect(screen.getByLabelText("Database name")).toHaveValue("dbname");
    expect(screen.getByLabelText("Display name")).toHaveValue("dbname");
    expect(screen.getByLabelText("Username")).toHaveValue("testuser");
    expect(screen.getByLabelText("Password")).toHaveValue("testpass");
    expect(
      screen.getByLabelText("Use a secure connection (SSL)"),
    ).toBeChecked();

    await userEvent.click(saveButton);

    // The connection string only pre-fills the form, the backend never sees it.
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.not.objectContaining({ "connection-string": expect.anything() }),
      ),
    );
  });

  it("should keep the values that the connection string does not set", async () => {
    await setup({ engines: ENGINES, initialValues: { engine: "postgres" } });

    await userEvent.type(screen.getByLabelText("Port"), "1111");

    await pasteConnectionString(
      "postgresql://postgres:password@db.apbkobhfnmcqqzqeeqss.supabase.co/postgres",
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Database name")).toHaveValue("postgres"),
    );
    expect(screen.getByLabelText("Port")).toHaveValue("1111");
    expect(screen.getByLabelText("Database type")).toHaveValue("PostgreSQL");
  });

  describe("analytics", () => {
    const trackSimpleEventMock = jest.mocked(trackSimpleEvent);

    const getConnectionStringEvents = () =>
      trackSimpleEventMock.mock.calls
        .map(([event]) => event)
        .filter(({ event }) => event.startsWith("connection_string_parsed_"));

    beforeEach(() => {
      trackSimpleEventMock.mockClear();
    });

    it("should track a single success event for everything typed before the field is blurred", async () => {
      await setup({
        engines: ENGINES,
        initialValues: { engine: "mysql" },
        location: "full-page",
      });

      await pasteConnectionString(MYSQL_CONNECTION_STRING);
      await userEvent.paste("jdbc:mysql://a:b@c:3/dbname?ssl=false");

      expect(
        await screen.findByText("Connection details pre-filled below."),
      ).toBeInTheDocument();
      expect(getConnectionStringEvents()).toEqual([]);

      await userEvent.click(screen.getByLabelText("Display name"));

      expect(getConnectionStringEvents()).toEqual([
        {
          event: "connection_string_parsed_success",
          triggered_from: "full-page",
        },
      ]);

      await userEvent.click(getConnectionStringField());
      await userEvent.click(screen.getByLabelText("Display name"));

      expect(getConnectionStringEvents()).toHaveLength(1);
    });

    it("should track a failure event when the connection string cannot be parsed", async () => {
      await setup({
        engines: ENGINES,
        initialValues: { engine: "mysql" },
        location: "full-page",
      });

      await pasteConnectionString("broken string");

      expect(
        await screen.findByText("Couldn’t use this connection string."),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Display name"));

      expect(getConnectionStringEvents()).toEqual([
        {
          event: "connection_string_parsed_failed",
          triggered_from: "full-page",
        },
      ]);
    });

    it("should report the admin modal as the source of the event", async () => {
      await setup({
        engines: ENGINES,
        initialValues: { engine: "mysql" },
        location: "admin",
      });

      await pasteConnectionString(MYSQL_CONNECTION_STRING);
      await userEvent.click(screen.getByLabelText("Display name"));

      expect(getConnectionStringEvents()).toEqual([
        { event: "connection_string_parsed_success", triggered_from: "admin" },
      ]);
    });
  });
});
