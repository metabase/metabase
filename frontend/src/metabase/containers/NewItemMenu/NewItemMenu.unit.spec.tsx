import React from "react";
import nock from "nock";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { setupDatabasesEndpoints } from "__support__/server-mocks";

import type { Database } from "metabase-types/api";
import { createMockCard, createMockDatabase } from "metabase-types/api/mocks";

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

const SAMPLE_DATABASE = createMockDatabase({
  id: 1,
  engine: "postgres",
  name: "Sample Database",
  native_permissions: "write",
  is_sample: true,
  settings: null,
});

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

function setup({
  databases = [SAMPLE_DATABASE, DB_WITH_ACTIONS],
  hasModels = true,
}: SetupOpts = {}) {
  const scope = nock(location.origin);
  const models = hasModels ? [createMockCard({ dataset: true })] : [];

  setupDatabasesEndpoints(scope, databases);

  scope.get(/\/api\/search/).reply(200, {
    available_models: ["dataset"],
    models: ["dataset"],
    data: models,
    total: models.length,
  });

  renderWithProviders(<NewItemMenu trigger={<button>New</button>} />);
  userEvent.click(screen.getByText("New"));
}

describe("NewItemMenu", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe("New Action", () => {
    it("should open action editor on click", async () => {
      setup();

      userEvent.click(await screen.findByText("Action"));
      const modal = screen.getByRole("dialog");

      expect(modal).toBeVisible();
    });

    it("should not be visible if there are no databases with actions enabled", () => {
      setup({ databases: [SAMPLE_DATABASE] });
      expect(screen.queryByText("Action")).not.toBeInTheDocument();
    });

    it("should not be visible if user has no models", () => {
      setup({ hasModels: false });
      expect(screen.queryByText("Action")).not.toBeInTheDocument();
    });

    it("should not be visible if user has no write data access", () => {
      setup({ databases: [DB_WITHOUT_WRITE_ACCESS] });
      expect(screen.queryByText("Action")).not.toBeInTheDocument();
    });
  });
});
