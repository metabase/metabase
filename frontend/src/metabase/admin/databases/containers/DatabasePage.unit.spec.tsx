import { waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupCreateDatabaseEndpoint,
  setupCreateDatabaseEndpointError,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { Engine, EngineKey } from "metabase-types/api";
import {
  createMockEngine,
  createMockEngineField,
  createMockEngines,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";

import { DatabasePage } from "./DatabasePage";

const HELP_PANEL_ENGINES: {
  key: EngineKey;
  driverName: string;
  docFile: string;
}[] = [
  { key: "athena", driverName: "Amazon Athena", docFile: "athena" },
  { key: "bigquery-cloud-sdk", driverName: "BigQuery", docFile: "bigquery" },
  { key: "redshift", driverName: "Amazon Redshift", docFile: "redshift" },
  { key: "clickhouse", driverName: "ClickHouse", docFile: "clickhouse" },
  { key: "databricks", driverName: "Databricks", docFile: "databricks" },
  { key: "druid-jdbc", driverName: "Druid JDBC", docFile: "druid" },
  { key: "mongo", driverName: "MongoDB", docFile: "mongodb" },
  { key: "mysql", driverName: "MySQL", docFile: "mysql" },
  { key: "postgres", driverName: "PostgreSQL", docFile: "postgresql" },
  { key: "presto-jdbc", driverName: "Presto", docFile: "presto" },
  { key: "sqlserver", driverName: "SQL Server", docFile: "sql-server" },
  { key: "snowflake", driverName: "Snowflake", docFile: "snowflake" },
  { key: "sparksql", driverName: "Spark SQL", docFile: "sparksql" },
  { key: "starburst", driverName: "Starburst (Trino)", docFile: "starburst" },
];

HELP_PANEL_ENGINES.forEach(({ docFile, driverName }) => {
  jest.doMock(
    `docs/databases/connections/${docFile}.md`,
    () => `${driverName} MD Content`,
  );
});

const POSTGRES_ENGINE = createMockEngine({
  "driver-name": "PostgreSQL",
  "details-fields": [
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

const BIGQUERY_ENGINE = createMockEngine({
  "driver-name": "BigQuery",
  "details-fields": [
    createMockEngineField({
      name: "service-account-json",
      "display-name": "Service account JSON file",
      required: true,
      type: "textFile",
    }),
    createMockEngineField({
      name: "dataset-filters-type",
      "display-name": "Datasets",
      type: "select",
      options: [
        { name: "All", value: "all" },
        { name: "Only these...", value: "inclusion" },
        { name: "All except...", value: "exclusion" },
      ],
      default: "all",
    }),
    createMockEngineField({
      name: "dataset-filters-patterns",
      type: "text",
      placeholder: "E.x. public,auth*",
      required: true,
      "visible-if": { "dataset-filters-type": "inclusion" },
    }),
  ],
});

interface SetupOpts {
  engines?: Record<string, Engine>;
}

const setup = ({ engines = createMockEngines() }: SetupOpts = {}) => {
  setupEnginesEndpoint(engines);

  renderWithProviders(<Route path="/" element={<DatabasePage />} />, {
    withRouter: true,
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings({
        "token-status": createMockTokenStatus({ valid: true }),
      }),
    }),
  });
};

const selectDatabaseType = async (driverName: string) => {
  await userEvent.click(
    within(await screen.findByTestId("database-form")).getByLabelText(
      "Database type",
    ),
  );
  await userEvent.click(
    await screen.findByRole("option", { name: driverName }),
  );
  expect(await screen.findByDisplayValue(driverName)).toBeInTheDocument();
};

const typeAndBlur = async (label: string, value: string) => {
  await userEvent.type(screen.getByLabelText(label), value);
  await userEvent.tab();
};

const submitForm = async () => {
  const saveButton = screen.getByRole("button", { name: "Save" });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await userEvent.click(saveButton);
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

  describe("Help side panel", () => {
    const openHelpPanel = async () => {
      await userEvent.click(
        await screen.findByRole("button", { name: /Help is here/ }),
      );
      return await screen.findByTestId("database-help-side-panel");
    };

    const closeHelpPanel = async () => {
      await userEvent.click(
        screen.getByRole("button", { name: /Close panel/ }),
      );
      expect(
        screen.queryByTestId("database-help-side-panel"),
      ).not.toBeInTheDocument();
    };

    it("should show help content and close the panel", async () => {
      setup();

      const panel = await openHelpPanel();
      expect(within(panel).getByText("Add PostgreSQL")).toBeInTheDocument();
      expect(
        within(panel).getByRole("link", { name: /Read the full docs/ }),
      ).toBeInTheDocument();
      expect(
        within(panel).getByRole("link", { name: /Talk to an expert/ }),
      ).toBeInTheDocument();
      expect(
        within(panel).getByRole("button", {
          name: /Invite a teammate to help you/,
        }),
      ).toBeInTheDocument();

      await closeHelpPanel();
    });

    it("should update the side panel content when the engine is changed", async () => {
      setup({
        engines: Object.fromEntries(
          HELP_PANEL_ENGINES.map(({ key, driverName }) => [
            key,
            createMockEngine({ "driver-name": driverName }),
          ]),
        ),
      });

      for (const { driverName, docFile } of HELP_PANEL_ENGINES) {
        await selectDatabaseType(driverName);
        const panel = await openHelpPanel();

        expect(
          within(panel).getByText(`Add ${driverName}`),
        ).toBeInTheDocument();
        expect(
          within(panel).getByRole("link", { name: /Read the full docs/ }),
        ).toHaveAttribute(
          "href",
          expect.stringContaining(`databases/connections/${docFile}`),
        );
        expect(
          await within(panel).findByText(`${driverName} MD Content`),
        ).toBeInTheDocument();
        expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();

        await closeHelpPanel();
      }
    });
  });

  describe("Saving a new database", () => {
    const fillPostgresForm = async () => {
      await screen.findByTestId("database-form");
      await typeAndBlur("Display name", "Test");
      await typeAndBlur("Database name", "db");
      await typeAndBlur("Username", "admin");
    };

    it("should show error upon a bad request", async () => {
      setupCreateDatabaseEndpointError({
        status: 400,
        body: "DATABASE CONNECTION ERROR",
      });
      setup({ engines: { postgres: POSTGRES_ENGINE } });

      await fillPostgresForm();
      await submitForm();

      expect(
        await screen.findByText("DATABASE CONNECTION ERROR"),
      ).toBeInTheDocument();
    });

    it("should show specific error message when error is on host or port", async () => {
      setupCreateDatabaseEndpointError({
        status: 400,
        body: {
          message: "DATABASE CONNECTION ERROR",
          errors: { host: "Check your host", port: "Check your port" },
        },
      });
      setup({ engines: { postgres: POSTGRES_ENGINE } });

      await fillPostgresForm();
      await submitForm();

      expect(
        await screen.findByText(
          /Make sure your Host and Port settings are correct/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("DATABASE CONNECTION ERROR"),
      ).not.toBeInTheDocument();
    });

    it("should send the uploaded Google service account JSON for BigQuery", async () => {
      const serviceAccountJSON = '{"foo": 123}';
      setupCreateDatabaseEndpoint({ id: 42 });
      setup({
        engines: {
          postgres: POSTGRES_ENGINE,
          "bigquery-cloud-sdk": BIGQUERY_ENGINE,
        },
      });

      await selectDatabaseType("BigQuery");
      await typeAndBlur("Display name", "BQ");
      await userEvent.click(screen.getByLabelText("Datasets"));
      await userEvent.click(
        await screen.findByRole("option", { name: "Only these..." }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("E.x. public,auth*"),
        "some-dataset",
      );
      // The file input has no accessible name: the field label points at the
      // wrapping label, which `upload` resolves to its input.
      await userEvent.upload(
        screen.getByText(
          (_content, element) =>
            element?.tagName === "LABEL" &&
            element.textContent === "Select a file",
        ),
        new File([serviceAccountJSON], "service-account.json"),
      );
      await submitForm();

      await waitFor(async () => {
        const [request] = await findRequests("POST");
        expect(request?.body).toMatchObject({
          engine: "bigquery-cloud-sdk",
          name: "BQ",
          details: {
            "service-account-json": serviceAccountJSON,
            "dataset-filters-type": "inclusion",
            "dataset-filters-patterns": "some-dataset",
          },
        });
      });
    });
  });
});
