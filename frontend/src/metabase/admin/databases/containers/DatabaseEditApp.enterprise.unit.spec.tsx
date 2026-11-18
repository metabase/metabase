import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  findRequests,
  setupDatabaseUsageInfoEndpoint,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { PLUGIN_WRITABLE_CONNECTION } from "metabase/plugins";
import { Outlet, Route } from "metabase/router";
import type { Database, GetDatabaseHealthResponse } from "metabase-types/api";
import {
  createMockDatabase,
  createMockEngine,
  createMockEngineField,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { isObject } from "metabase-types/guards";

import { DatabaseEditApp } from "./DatabaseEditApp";

const DATABASE_ID = 2;

const MAIN_DETAILS = {
  host: "localhost",
  port: 3306,
  dbname: "writable_db",
  user: "metabase",
};

const DEFAULT_USER = { username: "metabase", password: "metasample123" };
const READ_ONLY_USER = { username: "readonly_user", password: "readonly_pw" };
const INVALID_USER = { username: "invalid", password: "invalid" };

const CONNECTION_ERROR = "Access denied for user 'invalid'@'%'";
const WRITE_HEALTH_ERROR =
  "Could not connect: Access denied for user 'readonly_user'";

const HEALTH_OK: GetDatabaseHealthResponse = { status: "ok" };
const WRITE_HEALTH_ERROR_RESPONSE: GetDatabaseHealthResponse = {
  status: "error",
  message: WRITE_HEALTH_ERROR,
  errors: null,
};

const MYSQL_ENGINE = createMockEngine({
  "driver-name": "MySQL",
  "details-fields": [
    createMockEngineField({ name: "host", "display-name": "Host" }),
    createMockEngineField({
      name: "port",
      "display-name": "Port",
      type: "integer",
    }),
    createMockEngineField({
      name: "dbname",
      "display-name": "Database name",
    }),
    createMockEngineField({ name: "user", "display-name": "Username" }),
    createMockEngineField({
      name: "password",
      "display-name": "Password",
      type: "password",
    }),
    // The backend adds this marker to every engine (driver/common.clj)
    createMockEngineField({
      name: "write-data-connection",
      type: "hidden",
      default: false,
    }),
  ],
});

type WriteDataDetails = Database["write_data_details"];

interface SetupOpts {
  writeDataDetails: WriteDataDetails;
}

function getUser(details: WriteDataDetails): unknown {
  return isObject(details) ? details.user : undefined;
}

function setup({ writeDataDetails }: SetupOpts) {
  const server = { writeDataDetails };
  const getDatabase = (): Database =>
    createMockDatabase({
      id: DATABASE_ID,
      name: "Writable Database",
      engine: "mysql",
      details: MAIN_DETAILS,
      write_data_details: server.writeDataDetails,
    });

  // The plugin reads the token features from the global settings when it registers
  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          writable_connection: true,
        }),
      }),
    ),
  });
  setupEnterpriseOnlyPlugin("writable_connection");
  setupEnginesEndpoint({ mysql: MYSQL_ENGINE });
  setupDatabaseUsageInfoEndpoint(getDatabase(), {
    question: 0,
    dataset: 0,
    metric: 0,
    segment: 0,
    transform: 0,
  });
  fetchMock.get(`path:/api/database/${DATABASE_ID}`, () => getDatabase());
  fetchMock.get(`path:/api/database/${DATABASE_ID}/settings-available`, {
    settings: {},
  });
  fetchMock.get(`path:/api/database/${DATABASE_ID}/healthcheck`, ({ url }) =>
    getHealth(
      new URL(url).searchParams.get("connection-type"),
      server.writeDataDetails,
    ),
  );
  fetchMock.put(`path:/api/database/${DATABASE_ID}`, async ({ options }) => {
    const body: unknown = JSON.parse(String(options.body));
    if (!isObject(body) || !("write_data_details" in body)) {
      return { status: 400, body: { message: "Unexpected request" } };
    }
    const details = isObject(body.write_data_details)
      ? body.write_data_details
      : null;
    if (details != null && details["write-data-connection"] !== true) {
      return {
        status: 400,
        body: { message: "write-data-connection must be set" },
      };
    }
    if (getUser(details) === INVALID_USER.username) {
      return { status: 400, body: { message: CONNECTION_ERROR } };
    }
    server.writeDataDetails = details;
    return getDatabase();
  });

  const IsAdmin = () => <Outlet />;

  // Each call is a fresh page load against the same mocked server
  const visitDatabase = () =>
    renderWithProviders(
      <Route path="/admin/databases">
        {PLUGIN_WRITABLE_CONNECTION.getWritableConnectionInfoRoutes(IsAdmin)}
        <Route path=":databaseId" element={<DatabaseEditApp />} />
      </Route>,
      {
        withRouter: true,
        initialRoute: `/admin/databases/${DATABASE_ID}`,
        storeInitialState,
      },
    );

  let view = visitDatabase();
  const reload = () => {
    view.unmount();
    view = visitDatabase();
  };

  return { reload };
}

// Responses go in `body`: fetch-mock reads a top-level `status` as the HTTP status
function getHealth(
  connectionType: string | null,
  writeDataDetails: WriteDataDetails,
) {
  if (connectionType === "default") {
    return { body: HEALTH_OK };
  }
  if (connectionType !== "write-data" || writeDataDetails == null) {
    return { status: 400, body: { message: "Invalid connection type" } };
  }
  return {
    body:
      getUser(writeDataDetails) === DEFAULT_USER.username
        ? HEALTH_OK
        : WRITE_HEALTH_ERROR_RESPONSE,
  };
}

const getMainSection = () =>
  screen.findByTestId("database-connection-info-section");

const getWritableSection = () =>
  screen.findByTestId("writable-connection-info-section");

async function fillInCredentials({
  username,
  password,
}: {
  username: string;
  password: string;
}) {
  const usernameInput = await screen.findByLabelText("Username");
  await userEvent.clear(usernameInput);
  await userEvent.type(usernameInput, username);
  const passwordInput = screen.getByLabelText("Password");
  await userEvent.clear(passwordInput);
  await userEvent.type(passwordInput, password);
}

async function getPutBodies() {
  const requests = await findRequests("PUT");
  return requests.map(({ body }) => body);
}

describe("DatabaseEditApp > writable connection (EE)", () => {
  it("creates a writable connection and shows its health", async () => {
    const { reload } = setup({ writeDataDetails: null });

    const writableSection = await getWritableSection();
    expect(
      within(writableSection).queryByTestId("database-connection-health-info"),
    ).not.toBeInTheDocument();
    expect(
      within(writableSection).queryByRole("button", {
        name: "Remove writable connection",
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(writableSection).getByRole("link", {
        name: "Add writable connection",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Add writable connection" }),
    ).toBeInTheDocument();
    await fillInCredentials(DEFAULT_USER);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () =>
      expect(await getPutBodies()).toEqual([
        {
          write_data_details: {
            ...MAIN_DETAILS,
            user: DEFAULT_USER.username,
            password: DEFAULT_USER.password,
            "write-data-connection": true,
          },
        },
      ]),
    );

    reload();
    const section = await getWritableSection();
    await waitFor(() =>
      expect(
        within(section).getByTestId("database-connection-health-info"),
      ).toHaveTextContent("Connected"),
    );
    expect(
      within(section).getByRole("link", { name: "Edit connection details" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", {
        name: "Remove writable connection",
      }),
    ).toBeInTheDocument();
  });

  it("edits a writable connection and shows the health of each connection", async () => {
    const { reload } = setup({
      writeDataDetails: {
        ...MAIN_DETAILS,
        user: DEFAULT_USER.username,
        "write-data-connection": true,
      },
    });

    const writableSection = await getWritableSection();
    expect(
      await within(writableSection).findByText("Connected"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(writableSection).getByRole("link", {
        name: "Edit connection details",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Edit writable connection details",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveValue(
      DEFAULT_USER.username,
    );
    await fillInCredentials(READ_ONLY_USER);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(async () =>
      expect(await getPutBodies()).toEqual([
        {
          write_data_details: {
            ...MAIN_DETAILS,
            user: READ_ONLY_USER.username,
            password: READ_ONLY_USER.password,
            "write-data-connection": true,
          },
        },
      ]),
    );

    reload();
    expect(
      await within(await getWritableSection()).findByText(WRITE_HEALTH_ERROR),
    ).toBeInTheDocument();
    const mainSection = await getMainSection();
    await waitFor(() =>
      expect(
        within(mainSection).getByTestId("database-connection-health-info"),
      ).toHaveTextContent("Connected"),
    );
  });

  it("removes a writable connection", async () => {
    setup({
      writeDataDetails: {
        ...MAIN_DETAILS,
        user: DEFAULT_USER.username,
        "write-data-connection": true,
      },
    });

    const writableSection = await getWritableSection();
    expect(
      await within(writableSection).findByText("Connected"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(writableSection).getByRole("button", {
        name: "Remove writable connection",
      }),
    );
    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText("Remove writable connection?"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Remove" }),
    );

    expect(
      await within(writableSection).findByRole("link", {
        name: "Add writable connection",
      }),
    ).toBeInTheDocument();
    expect(
      within(writableSection).queryByTestId("database-connection-health-info"),
    ).not.toBeInTheDocument();
    expect(
      within(writableSection).queryByRole("button", {
        name: "Remove writable connection",
      }),
    ).not.toBeInTheDocument();
    expect(await getPutBodies()).toEqual([{ write_data_details: null }]);
  });

  it("shows the connection error and stays on the form when the details are invalid", async () => {
    setup({ writeDataDetails: null });

    await userEvent.click(
      within(await getWritableSection()).getByRole("link", {
        name: "Add writable connection",
      }),
    );
    await fillInCredentials(INVALID_USER);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Metabase tried, but couldn't connect");
    expect(alert).toHaveTextContent(CONNECTION_ERROR);
    expect(
      screen.getByRole("heading", { name: "Add writable connection" }),
    ).toBeInTheDocument();
    expect(await getPutBodies()).toEqual([
      {
        write_data_details: expect.objectContaining({
          user: INVALID_USER.username,
          password: INVALID_USER.password,
          "write-data-connection": true,
        }),
      },
    ]);
  });
});
