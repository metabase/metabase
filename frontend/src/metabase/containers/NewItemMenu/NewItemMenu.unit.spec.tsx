import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { EmbeddingEntityType } from "metabase/embedding-sdk/store";
import * as domUtils from "metabase/lib/dom";
import { NewModals } from "metabase/new/components/NewModals/NewModals";
import type { Database } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDatabase,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  createMockEmbedOptions,
  createMockEmbedState,
  createMockState,
} from "metabase-types/store/mocks";

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
  isEmbeddingIframe?: boolean;
  entityTypes?: EmbeddingEntityType[];
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
  isEmbeddingIframe,
  entityTypes,
}: SetupOpts = {}) {
  const models = hasModels ? [createMockCard({ type: "model" })] : [];

  setupDatabasesEndpoints(databases);
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

  if (isEmbeddingIframe) {
    jest.spyOn(domUtils, "isWithinIframe").mockReturnValue(true);
  }

  renderWithProviders(
    <>
      <NewItemMenu trigger={<button>New</button>} />
      <NewModals />
    </>,
    entityTypes
      ? {
          storeInitialState: createMockState({
            embed: createMockEmbedState({
              options: createMockEmbedOptions({
                entity_types: entityTypes,
              }),
            }),
          }),
        }
      : undefined,
  );
  await userEvent.click(screen.getByText("New"));
}

describe("NewItemMenu", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should properly render menu items", async () => {
    setup();
    expect(await screen.findByText("Question")).toBeInTheDocument();
    expect(await screen.findByText("SQL query")).toBeInTheDocument();
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(await screen.findByText("Model")).toBeInTheDocument();
    expect(await screen.findByText("Action")).toBeInTheDocument();
    expect(screen.queryByText("Metric")).not.toBeInTheDocument();
    expect(screen.queryByText("Collection")).not.toBeInTheDocument();
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

  describe("interactive embedding with `entity_types` (EMB-230)", () => {
    it("should show models when no `entity_types` is provided", async () => {
      await setup({ isEmbeddingIframe: true });
      expect(
        screen.getByRole("listitem", { name: "Question" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "SQL query" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Dashboard" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Model" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Action" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Metric" }),
      ).not.toBeInTheDocument();
    });

    it('should show models when `entity_types` is `["model", "table"]`', async () => {
      await setup({ isEmbeddingIframe: true, entityTypes: ["model", "table"] });
      expect(
        screen.getByRole("listitem", { name: "Question" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "SQL query" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Dashboard" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Model" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Action" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Metric" }),
      ).not.toBeInTheDocument();
    });

    it('should show models when `entity_types` is `["model"]`', async () => {
      await setup({
        isEmbeddingIframe: true,
        entityTypes: ["model"],
      });
      expect(
        screen.getByRole("listitem", { name: "Question" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "SQL query" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Dashboard" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Model" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Action" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Metric" }),
      ).not.toBeInTheDocument();
    });

    it('should not show models when `entity_types` is `["table"]` (does not contain "model")', async () => {
      await setup({
        isEmbeddingIframe: true,
        entityTypes: ["table"],
      });
      expect(
        screen.getByRole("listitem", { name: "Question" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "SQL query" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("listitem", { name: "Dashboard" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Model" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Action" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("listitem", { name: "Metric" }),
      ).not.toBeInTheDocument();
    });
  });
});
