import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnginesEndpoint } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockEngine,
  createMockEngineField,
  createMockEngines,
} from "metabase-types/api/mocks";

import { DatabasePage } from "./DatabasePage";

jest.mock(
  "docs/databases/connections/postgresql.md",
  () => "Postgres MD Content",
);

const CONNECTION_ERROR_MESSAGE = "DATABASE CONNECTION ERROR";

const POSTGRES_ENGINE = createMockEngine({
  "driver-name": "PostgreSQL",
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
      required: true,
    }),
    createMockEngineField({
      name: "user",
      "display-name": "Username",
      required: true,
    }),
  ],
});

interface SetupOpts {
  createDatabaseErrorBody?: unknown;
}

const setup = ({ createDatabaseErrorBody }: SetupOpts = {}) => {
  setupEnginesEndpoint(createMockEngines({ postgres: POSTGRES_ENGINE }));
  if (createDatabaseErrorBody !== undefined) {
    fetchMock.post("path:/api/database", {
      status: 400,
      body: createDatabaseErrorBody,
    });
  }

  renderWithProviders(<Route path="/" element={<DatabasePage />} />, {
    withRouter: true,
    storeInitialState: createMockState(),
  });
};

const fillInAndSaveDatabase = async () => {
  await userEvent.type(await screen.findByLabelText("Display name"), "Test");
  await userEvent.type(screen.getByLabelText("Database name"), "db");
  await userEvent.type(screen.getByLabelText("Username"), "admin");

  const saveButton = screen.getByRole("button", { name: "Save" });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await userEvent.click(saveButton);

  await waitFor(() => {
    expect(fetchMock.callHistory.called("path:/api/database")).toBe(true);
  });
};

describe("DatabasePage", () => {
  describe("Help button", () => {
    it("should render the 'Help is here' button", async () => {
      setup();
      expect(
        await screen.findByRole("button", { name: /Help is here/ }),
      ).toBeInTheDocument();
    });

    it("should show the side panel when 'Help is here' button is clicked", async () => {
      setup();
      await userEvent.click(
        await screen.findByRole("button", { name: /Help is here/ }),
      );
      await waitFor(() => {
        expect(
          screen.getByTestId("database-help-side-panel"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("saving a new database", () => {
    it("should show the error message when the database cannot be created", async () => {
      setup({ createDatabaseErrorBody: CONNECTION_ERROR_MESSAGE });

      await fillInAndSaveDatabase();

      expect(
        await screen.findByText(CONNECTION_ERROR_MESSAGE),
      ).toBeInTheDocument();
    });

    it("should show a host and port hint instead of the error message when the error is on the host or port", async () => {
      setup({
        createDatabaseErrorBody: {
          message: CONNECTION_ERROR_MESSAGE,
          errors: {
            host: "Check your host",
            port: "Check your port",
          },
        },
      });

      await fillInAndSaveDatabase();

      expect(
        await screen.findByText(
          /Make sure your Host and Port settings are correct/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(CONNECTION_ERROR_MESSAGE),
      ).not.toBeInTheDocument();
    });
  });
});
