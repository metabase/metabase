import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupDatabasesEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Database } from "metabase-types/api";
import {
  createOrdersTable,
  createPeopleTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getMetadataRoutes } from "../../routes";

const ORDERS_TABLE = createOrdersTable();

const SAMPLE_DB = createSampleDatabase({
  tables: [ORDERS_TABLE],
});

const PEOPLE_TABLE_MULTI_SCHEMA = createPeopleTable({
  db_id: 2,
});

const REVIEWS_TABLE_MULTI_SCHEMA = createReviewsTable({
  db_id: 2,
  schema: "PRIVATE",
});

const SAMPLE_DB_MULTI_SCHEMA = createSampleDatabase({
  id: 2,
  name: "Multi schema",
  tables: [PEOPLE_TABLE_MULTI_SCHEMA, REVIEWS_TABLE_MULTI_SCHEMA],
});

const ORDERS_TABLE_NO_SCHEMA = createOrdersTable({
  id: 10,
  db_id: 3,
  schema: "",
});

const SAMPLE_DB_NO_SCHEMA = createSampleDatabase({
  id: 3,
  name: "No schema",
  tables: [ORDERS_TABLE_NO_SCHEMA],
});

interface SetupOpts {
  databases?: Database[];
}

const setup = async ({ databases = [SAMPLE_DB] }: SetupOpts = {}) => {
  setupDatabasesEndpoints(databases);
  setupSearchEndpoints([]);

  renderWithProviders(
    <Route path="admin/datamodel">{getMetadataRoutes()}</Route>,
    { withRouter: true, initialRoute: "admin/datamodel" },
  );

  await waitForLoaderToBeRemoved();
};

describe("MetadataTableSettings", () => {
  describe("breadcrumbs", () => {
    it("should allow to navigate to and from table settings in a no-schema database", async () => {
      await setup({ databases: [SAMPLE_DB_NO_SCHEMA] });

      await userEvent.click(
        screen.getByText(ORDERS_TABLE_NO_SCHEMA.display_name),
      );
      await userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      await userEvent.click(screen.getByText(SAMPLE_DB_NO_SCHEMA.name));
      expect(await screen.findByText("1 Queryable Table")).toBeInTheDocument();

      await userEvent.click(
        screen.getByText(ORDERS_TABLE_NO_SCHEMA.display_name),
      );
      await userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      await userEvent.click(
        screen.getByText(ORDERS_TABLE_NO_SCHEMA.display_name),
      );
      expect(
        await screen.findByDisplayValue(ORDERS_TABLE_NO_SCHEMA.display_name),
      ).toBeInTheDocument();
    });

    it("should allow to navigate to and from table settings in a single-schema database", async () => {
      await setup();

      await userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      await userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      await userEvent.click(screen.getByText(SAMPLE_DB.name));
      expect(await screen.findByText("1 Queryable Table")).toBeInTheDocument();

      await userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      await userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      await userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      expect(
        await screen.findByDisplayValue(ORDERS_TABLE.display_name),
      ).toBeInTheDocument();
    });

    it("should allow to navigate to and from table settings in a multi-schema database", async () => {
      await setup({ databases: [SAMPLE_DB_MULTI_SCHEMA] });

      await userEvent.click(screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.schema));
      await userEvent.click(
        await screen.findByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      );
      await userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      await userEvent.click(screen.getByText(SAMPLE_DB_MULTI_SCHEMA.name));
      expect(await screen.findByText("2 schemas")).toBeInTheDocument();

      await userEvent.click(screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.schema));
      await userEvent.click(
        screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      );
      await userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      await userEvent.click(screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.schema));
      expect(await screen.findByText("1 Queryable Table")).toBeInTheDocument();

      await userEvent.click(
        await screen.findByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      );
      await userEvent.click(screen.getByLabelText("Settings"));
      expect(await screen.findByText("Settings")).toBeInTheDocument();

      await userEvent.click(
        screen.getByText(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      );
      expect(
        await screen.findByDisplayValue(PEOPLE_TABLE_MULTI_SCHEMA.display_name),
      ).toBeInTheDocument();
    });
  });

  describe("table settings", () => {
    it("should allow to rescan field values", async () => {
      await setup();

      await userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      await userEvent.click(screen.getByLabelText("Settings"));
      await userEvent.click(
        await screen.findByRole("button", { name: "Re-scan this table" }),
      );

      await waitFor(() => {
        const path = `path:/api/table/${ORDERS_TABLE.id}/rescan_values`;
        expect(fetchMock.called(path, { method: "POST" })).toBeTruthy();
      });
    });

    it("should allow to discard field values", async () => {
      await setup();

      await userEvent.click(screen.getByText(ORDERS_TABLE.display_name));
      await userEvent.click(screen.getByLabelText("Settings"));
      await userEvent.click(
        await screen.findByRole("button", {
          name: "Discard cached field values",
        }),
      );

      await waitFor(() => {
        const path = `path:/api/table/${ORDERS_TABLE.id}/discard_values`;
        expect(fetchMock.called(path, { method: "POST" })).toBeTruthy();
      });
    });
  });
});
