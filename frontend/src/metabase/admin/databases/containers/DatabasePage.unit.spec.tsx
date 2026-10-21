import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCreateDatabaseEndpointError,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { postgresFormConfig } from "metabase/databases/components/DatabaseForm/tests/postgres-form-config.mock";
import { Route } from "metabase/router";
import type { Engine } from "metabase-types/api";
import { createMockEngines } from "metabase-types/api/mocks";

import { DatabasePage } from "./DatabasePage";

jest.mock(
  "docs/databases/connections/postgresql.md",
  () => "Postgres MD Content",
);

interface SetupOpts {
  engines?: Record<string, Engine>;
}

const setup = ({ engines = createMockEngines() }: SetupOpts = {}) => {
  setupEnginesEndpoint(engines);

  renderWithProviders(<Route path="/" element={<DatabasePage />} />, {
    withRouter: true,
    storeInitialState: createMockState(),
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
    const fillAndSaveForm = async () => {
      await userEvent.type(
        await screen.findByLabelText(/Display name/),
        "Test",
      );
      await userEvent.type(screen.getByLabelText(/Database name/), "db");
      await userEvent.type(screen.getByLabelText(/Username/), "admin");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(fetchMock.callHistory.called("database-post-error")).toBe(true),
      );
    };

    it("shows the error the server returns", async () => {
      setupCreateDatabaseEndpointError("DATABASE CONNECTION ERROR");
      setup({ engines: { postgres: postgresFormConfig } });

      await fillAndSaveForm();

      expect(
        await screen.findByText("DATABASE CONNECTION ERROR"),
      ).toBeInTheDocument();
    });

    it("explains a host or port error instead of showing the server message", async () => {
      setupCreateDatabaseEndpointError({
        message: "DATABASE CONNECTION ERROR",
        errors: { host: "Check your host", port: "Check your port" },
      });
      setup({ engines: { postgres: postgresFormConfig } });

      await fillAndSaveForm();

      expect(
        await screen.findByText(
          /Make sure your Host and Port settings are correct/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("DATABASE CONNECTION ERROR"),
      ).not.toBeInTheDocument();
    });
  });
});
