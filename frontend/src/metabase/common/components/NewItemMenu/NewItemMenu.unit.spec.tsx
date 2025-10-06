import userEvent from "@testing-library/user-event";

import {
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { NewModals } from "metabase/new/components/NewModals/NewModals";
import type { Database } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import NewItemMenu from "./NewItemMenu";

console.warn = jest.fn();
console.error = jest.fn();

type SetupOpts = {
  databases?: Database[];
  hasModels?: boolean;
};

const SAMPLE_DATABASE = createSampleDatabase();
const COLLECTION = createMockCollection();

async function setup({ databases = [SAMPLE_DATABASE] }: SetupOpts = {}) {
  setupDatabasesEndpoints(databases);
  setupCollectionByIdEndpoint({
    collections: [COLLECTION],
  });

  renderWithProviders(
    <>
      <NewItemMenu trigger={<button>New</button>} />
      <NewModals />
    </>,
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
    expect(screen.queryByText("Metric")).not.toBeInTheDocument();
    expect(screen.queryByText("Collection")).not.toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
    expect(screen.queryByText("Action")).not.toBeInTheDocument();
  });

  it("should support keyboard navigation", async () => {
    await setup();

    await userEvent.keyboard("{ArrowDown}");

    expect(
      await screen.findByRole("menuitem", { name: /Question/ }),
    ).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");

    expect(
      await screen.findByRole("menuitem", { name: /Dashboard/ }),
    ).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("dialog", { name: /New dashboard/ }),
    ).toBeInTheDocument();
  });

  describe("New Dashboard", () => {
    it("should open new dashboard modal on click", async () => {
      await setup();
      await userEvent.click(await screen.findByText("Dashboard"));
      const modal = await screen.findByRole("dialog");
      expect(modal).toHaveTextContent("New dashboard");
    });
  });
});
