import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { useState } from "react";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Input } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import { type RecentItem, isRecentTableItem } from "metabase-types/api";
import {
  createMockDatabase,
  createMockRecentCollectionItem,
  createMockRecentTableItem,
  createMockSearchResult,
  createMockTokenFeatures,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import type { SettingsState } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import {
  CommandSuggestion,
  type CommandSuggestionProps,
} from "./CommandSuggestion";

registerVisualizations();

const SEARCH_ITEMS = [
  createMockSearchResult({
    name: "Orders by product",
    model: "card",
    display: "bar",
    id: 1,
  }),
  createMockSearchResult({
    name: "Orders by category",
    model: "card",
    display: "pie",
    id: 2,
  }),
  createMockSearchResult({
    name: "Total accounts",
    model: "card",
    display: "scalar",
    id: 3,
  }),
  createMockSearchResult({
    name: "Orders report",
    model: "document",
    id: 4,
  }),
  createMockSearchResult({
    name: "Account quotes",
    model: "card",
    id: 5,
  }),
];

const RECENT_ITEMS = [
  createMockRecentCollectionItem({
    id: 6,
    name: "Recent Card",
    model: "card",
    display: "bar",
  }),
  createMockRecentCollectionItem({
    id: 7,
    name: "Recent Document",
    model: "document",
  }),
  createMockRecentTableItem({
    id: 8,
    display_name: "Recent Table",
    name: "recent_table",
    model: "table",
  }),
];

const getRecentItemName = (item: RecentItem) =>
  isRecentTableItem(item) ? (item.display_name ?? item.name) : item.name;

const MOCK_DATABASE = createMockDatabase({
  is_saved_questions: true,
  native_permissions: "write",
});

const TestWrapper = (props: CommandSuggestionProps) => {
  const [query, setQuery] = useState(props.query);

  return (
    <>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="test-input"
      />
      <CommandSuggestion {...props} query={query} />
    </>
  );
};

type SetupProps = {
  query?: string;
  settings?: SettingsState;
};

const setup = ({
  query = "",
  settings = mockSettings({}),
}: SetupProps = {}) => {
  const command = jest.fn();

  const editor = {
    commands: {
      focus: jest.fn(),
    },
    schema: { nodes: {} },
    isActive: jest.fn(),
  };

  setupSearchEndpoints(SEARCH_ITEMS);
  setupRecentViewsEndpoints(RECENT_ITEMS);
  setupDatabasesEndpoints([MOCK_DATABASE]);

  renderWithProviders(
    <TestWrapper
      command={command}
      editor={editor as unknown as Editor}
      query={query}
      items={[]}
      range={{ from: 0, to: 0 }}
    />,
    { storeInitialState: createMockState({ settings }) },
  );

  return {
    command,
  };
};

describe("CommandSuggestion", () => {
  it("renders with default commands", async () => {
    setup();

    await expectStandardCommandsToBePresent();
  });

  it("searches for possible card embeds by default", async () => {
    const { command } = setup({ query: "Ord" });

    // Find cards that were searched for, with appropriate icons
    expect(
      within(
        await screen.findByRole("option", { name: /Orders by product/ }),
      ).getByRole("img", { name: /bar/ }),
    ).toBeInTheDocument();

    expect(
      within(
        await screen.findByRole("option", { name: /Orders by category/ }),
      ).getByRole("img", { name: /pie/ }),
    ).toBeInTheDocument();

    // Should not find things that cannot be embedded as a card
    expect(
      screen.queryByRole("option", { name: /Orders report/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("option", { name: /Orders by category/ }),
    );

    // Expect a call with embedItem. This tells us it was a chart embed
    expect(command).toHaveBeenCalledWith({
      embedItem: true,
      entityId: 2,
      model: "card",
      document: null,
    });
  });

  it("supports embedding links", async () => {
    const { command } = setup();

    await userEvent.click(await screen.findByRole("option", { name: "Link" }));

    await userEvent.type(
      screen.getByRole("textbox", { name: "test-input" }),
      "Ord",
    );

    expect(
      await screen.findByRole("option", { name: /Orders by product/ }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("option", { name: /Orders report/ }),
    ).toBeInTheDocument();

    // Clicking on an option should execute the select item command
    await userEvent.click(
      screen.getByRole("option", { name: /Orders report/ }),
    );

    // Expect a call with embedItem. This tells us it was a chart embed
    expect(command).toHaveBeenCalledWith({
      selectItem: true,
      entityId: 4,
      model: "document",
      document: null,
    });
  });

  it("should include formatting commands for default search, not for Chart search", async () => {
    const { command } = setup({ query: "Quo" });

    expect(
      await screen.findByRole("option", { name: /Account quotes/ }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("option", { name: "Quote" }),
    ).toBeInTheDocument();

    await userEvent.clear(screen.getByRole("textbox", { name: "test-input" }));

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));

    await userEvent.type(
      screen.getByRole("textbox", { name: "test-input" }),
      "Quo",
    );

    expect(
      await screen.findByRole("option", { name: /Account quotes/ }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("option", { name: "Quote" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("option", { name: /Account quotes/ }),
    );

    expect(command).toHaveBeenCalledWith({
      embedItem: true,
      entityId: 5,
      model: "card",
      document: null,
    });
  });

  it("should display recent embeddable items when in embed mode with an empty query", async () => {
    const { command } = setup({ query: "" });

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));

    expect(
      await screen.findByRole("option", {
        name: new RegExp(getRecentItemName(RECENT_ITEMS[0])),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", {
        name: new RegExp(getRecentItemName(RECENT_ITEMS[1])),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", {
        name: new RegExp(getRecentItemName(RECENT_ITEMS[2])),
      }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("option", {
        name: new RegExp(getRecentItemName(RECENT_ITEMS[0])),
      }),
    );

    expect(command).toHaveBeenCalledWith({
      embedItem: true,
      entityId: 6,
      model: "card",
      document: null,
    });
  });

  it("should display recent linkable items when in link mode with an empty query", async () => {
    const { command } = setup({ query: "" });

    await userEvent.click(await screen.findByRole("option", { name: "Link" }));

    expect(
      await screen.findByRole("option", {
        name: new RegExp(getRecentItemName(RECENT_ITEMS[0])),
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", {
        name: new RegExp(getRecentItemName(RECENT_ITEMS[1])),
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("option", {
        name: new RegExp(getRecentItemName(RECENT_ITEMS[2])),
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("option", {
        name: new RegExp(getRecentItemName(RECENT_ITEMS[2])),
      }),
    );

    expect(command).toHaveBeenCalledWith({
      selectItem: true,
      entityId: 8,
      model: "table",
      document: null,
    });
  });

  it("should auto-open the Browse all modal when clicking Chart with no recent items and no New Question", async () => {
    // Setup with empty recent items to reproduce the bug
    setupSearchEndpoints(SEARCH_ITEMS);
    setupRecentViewsEndpoints([]);
    setupCollectionByIdEndpoint({ collections: [] });
    setupCollectionItemsEndpoint({
      collection: { id: "root" },
      collectionItems: [],
    });
    setupCollectionItemsEndpoint({
      collection: { id: 1 },
      collectionItems: [],
    });

    setupDatabasesEndpoints([
      createMockDatabase({
        is_saved_questions: false,
        native_permissions: "none",
      }),
    ]);

    const command = jest.fn();
    const editor = {
      commands: {
        focus: jest.fn(),
      },
      schema: { nodes: {} },
      isActive: jest.fn(),
    };

    renderWithProviders(
      <TestWrapper
        command={command}
        editor={editor as unknown as Editor}
        query=""
        items={[]}
        range={{ from: 0, to: 0 }}
      />,
      { storeInitialState: createMockState({ settings: mockSettings({}) }) },
    );

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));

    // The modal should auto-open, so we should see it
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("should not show redundant divider when no recent items exist", async () => {
    // Setup with empty recent items to reproduce the bug
    setupSearchEndpoints(SEARCH_ITEMS);
    setupRecentViewsEndpoints([]);
    setupCollectionByIdEndpoint({ collections: [] });
    setupCollectionItemsEndpoint({
      collection: { id: "root" },
      collectionItems: [],
    });
    setupCollectionItemsEndpoint({
      collection: { id: 1 },
      collectionItems: [],
    });
    setupDatabasesEndpoints([MOCK_DATABASE]);

    const command = jest.fn();
    const editor = {
      commands: {
        focus: jest.fn(),
      },
      schema: { nodes: {} },
      isActive: jest.fn(),
    };

    renderWithProviders(
      <TestWrapper
        command={command}
        editor={editor as unknown as Editor}
        query=""
        items={[]}
        range={{ from: 0, to: 0 }}
      />,
      {
        storeInitialState: createMockState({
          currentUser: createMockUser({
            permissions: createMockUserPermissions({
              can_create_queries: true,
            }),
          }),
          settings: mockSettings({}),
        }),
      },
    );

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));

    // Now the menu should show Browse all without a redundant divider
    expect(await screen.findByText("Browse all")).toBeInTheDocument();
    expect(await screen.findByText("New chart")).toBeInTheDocument();

    // There should be no menu items above Browse all, so no divider should be present
    const menuContainer = screen.getByLabelText("Command Dialog");
    const dividers = within(menuContainer).queryAllByRole("separator");
    expect(dividers).toHaveLength(0);
  });

  describe("metabot", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe("when metabot is disabled", () => {
      beforeEach(() => {
        PLUGIN_METABOT.isEnabled = jest.fn(() => false);
      });

      it("should show all available commands except Metabot", async () => {
        const settings = mockSettings({
          "token-features": createMockTokenFeatures({
            metabot_v3: false,
          }),
        });

        setup({ settings });

        expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
        await expectStandardCommandsToBePresent();
      });
    });

    describe("when metabot is enabled", () => {
      beforeEach(() => {
        PLUGIN_METABOT.isEnabled = jest.fn(() => true);
      });

      it("should show all available commands including Metabot", async () => {
        const settings = mockSettings({
          "token-features": createMockTokenFeatures({
            metabot_v3: true,
          }),
        });

        setup({ settings });

        expect(screen.getByText("Ask Metabot")).toBeInTheDocument();
        await expectStandardCommandsToBePresent();
      });
    });
  });
});

const expectStandardCommandsToBePresent = async () => {
  // Custom Commands
  expect(
    await screen.findByRole("option", { name: "Chart" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "Link" }),
  ).toBeInTheDocument();

  // Formatting Commands

  expect(
    await screen.findByRole("option", { name: "Heading 1" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "Heading 2" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "Heading 3" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "Bullet list" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "Numbered list" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "Quote" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("option", { name: "Code block" }),
  ).toBeInTheDocument();
};
