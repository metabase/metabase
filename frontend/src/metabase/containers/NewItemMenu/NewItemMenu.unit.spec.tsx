import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { NewModals } from "metabase/new/components/NewModals/NewModals";
import type { Database } from "metabase-types/api";
import {
  createMockCard,
  createMockDatabase,
  createMockCollection,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import NewItemMenu from "./NewItemMenu";

jest.mock(
  "metabase/actions/containers/ActionCreator",
  () =>
    function ActionCreator() {
      return <div data-testid="mock-action-editor" />;
    },
);

console.warn = jest.fn();
console.error = jest.fn();

type SetupOpts = {
  databases?: Database[];
  hasModels?: boolean;
};

const SAMPLE_DATABASE = createSampleDatabase();

const DB_WITH_ACTIONS = createMockDatabase({
  id: 2,
  name: "Postgres with actions",
  engine: "postgres",
  native_permissions: "write",
  settings: { "database-enable-actions": true },
});

const DB_WITHOUT_WRITE_ACCESS = createMockDatabase({
  ...DB_WITH_ACTIONS,
  id: 3,
  native_permissions: "none",
});

const COLLECTION = createMockCollection();

async function setup({
  databases = [SAMPLE_DATABASE, DB_WITH_ACTIONS],
  hasModels = true,
}: SetupOpts = {}) {
  const models = hasModels ? [createMockCard({ type: "model" })] : [];

  setupDatabasesEndpoints(databases);
  setupCollectionsEndpoints({
    collections: [COLLECTION],
  });
  setupCollectionByIdEndpoint({
    collections: [COLLECTION],
  });

  fetchMock.get(
    {
      url: "path:/api/search",
    },
    {
      available_models: ["dataset"],
      models: ["dataset"],
      data: models,
      total: models.length,
    },
  );

  renderWithProviders(
    <>
      <NewItemMenu trigger={<button>New</button>} />
      <NewModals />
    </>,
  );
  await userEvent.click(screen.getByText("New"));
}

describe("NewItemMenu", () => {
  describe("New Collection", () => {
    it("should open new collection modal on click", async () => {
      setup();
      await userEvent.click(await screen.findByText("Collection"));
      const modal = await screen.findByRole("dialog", {
        name: /new collection/i,
      });
      expect(modal).toBeVisible();
    });
  });

  describe("New Dashboard", () => {
    it("should open new dashboard modal on click", async () => {
      setup();
      await userEvent.click(await screen.findByText("Dashboard"));
      const modal = await screen.findByRole("dialog");
      expect(modal).toHaveTextContent("New dashboard");
    });
  });

  describe("New Action", () => {
    it("should open action editor on click", async () => {
      await setup();

      await userEvent.click(await screen.findByText("Action"));
      const modal = screen.getByRole("dialog");

      expect(modal).toBeVisible();
    });

    it("should not be visible if there are no databases with actions enabled", async () => {
      await setup({ databases: [SAMPLE_DATABASE] });
      expect(screen.queryByText("Action")).not.toBeInTheDocument();
    });

    it("should not be visible if user has no models", async () => {
      await setup({ hasModels: false });
      expect(screen.queryByText("Action")).not.toBeInTheDocument();
    });

    it("should not be visible if user has no write data access", async () => {
      await setup({ databases: [DB_WITHOUT_WRITE_ACCESS] });
      expect(screen.queryByText("Action")).not.toBeInTheDocument();
    });
  });
});
