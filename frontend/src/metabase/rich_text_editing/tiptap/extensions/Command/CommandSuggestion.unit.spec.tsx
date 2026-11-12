import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { createRef, forwardRef, useState } from "react";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { Input } from "metabase/ui";
import {
  type RecentItem,
  type SearchResult,
  isRecentTableItem,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockRecentCollectionItem,
  createMockRecentTableItem,
  createMockSearchResult,
} from "metabase-types/api/mocks";

import {
  CommandSuggestion,
  type CommandSuggestionProps,
  type CommandSuggestionRef,
} from "./CommandSuggestion";
import type {
  NewQuestionModalProps,
  NewQuestionModals,
  NewQuestionOption,
} from "./types";
import type { MetabotCommandConfig } from "./utils";

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
  native_permissions: "write",
});

const TestWrapper = forwardRef<CommandSuggestionRef, CommandSuggestionProps>(
  function TestWrapper(props, ref) {
    const [query, setQuery] = useState(props.query);

    return (
      <>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="test-input"
        />
        <CommandSuggestion {...props} ref={ref} query={query} />
      </>
    );
  },
);

type SetupProps = {
  query?: string;
  metabotCommand?: MetabotCommandConfig | null;
  newQuestionOptions?: NewQuestionOption[];
  recentItems?: RecentItem[];
  searchItems?: SearchResult[];
  newQuestionModals?: NewQuestionModals;
};

const TEST_NEW_QUESTION_MODALS = {
  notebook: () => null,
  native: () => null,
};

const NativeQuestionModalStub = ({ onClose }: NewQuestionModalProps) => (
  <div role="dialog" aria-label="Native question modal">
    <button onClick={onClose}>Cancel</button>
  </div>
);

const NEW_QUESTION_OPTIONS: NewQuestionOption[] = [
  { value: "notebook", label: "New Question", icon: "insight" },
  { value: "native", label: "New SQL query", icon: "sql" },
];

const setup = ({
  query = "",
  metabotCommand = null,
  newQuestionOptions = [],
  recentItems = RECENT_ITEMS,
  searchItems = SEARCH_ITEMS,
  newQuestionModals = TEST_NEW_QUESTION_MODALS,
}: SetupProps = {}) => {
  const ref = createRef<CommandSuggestionRef>();
  const command = jest.fn();

  const editor = {
    commands: {
      focus: jest.fn(),
    },
    schema: { nodes: {} },
    isActive: jest.fn(),
  };

  setupSearchEndpoints(searchItems);
  setupRecentViewsEndpoints(recentItems);
  setupDatabasesEndpoints([MOCK_DATABASE]);

  renderWithProviders(
    <TestWrapper
      ref={ref}
      command={command}
      // Unjustified type cast. FIXME
      editor={editor as unknown as Editor}
      query={query}
      items={[]}
      range={{ from: 0, to: 0 }}
      metabotCommand={metabotCommand}
      newQuestionOptions={newQuestionOptions}
      newQuestionModals={newQuestionModals}
    />,
    { storeInitialState: createMockState({ settings: mockSettings({}) }) },
  );

  const pressKey = (key: string) =>
    act(() => {
      ref.current?.onKeyDown({ event: new KeyboardEvent("keydown", { key }) });
    });

  return {
    command,
    pressKey,
  };
};

describe("CommandSuggestion", () => {
  it("renders with default commands", async () => {
    setup();

    await expectStandardCommandsToBePresent();
  });

  it("searches for possible card embeds by default", async () => {
    const { command } = setup({ query: "Ord" });

    // Find cards that were searched for. The per-display icon names come from
    // the visualization registry, which isn't populated in this isolated spec.
    expect(
      await screen.findByRole("option", { name: /Orders by product/ }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("option", { name: /Orders by category/ }),
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
        // Unjustified type cast. FIXME
        editor={editor as unknown as Editor}
        query=""
        items={[]}
        range={{ from: 0, to: 0 }}
        newQuestionOptions={[]}
        newQuestionModals={TEST_NEW_QUESTION_MODALS}
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
        // Unjustified type cast. FIXME
        editor={editor as unknown as Editor}
        query=""
        items={[]}
        range={{ from: 0, to: 0 }}
        newQuestionOptions={[
          { value: "notebook", label: "New Question", icon: "insight" },
        ]}
        newQuestionModals={TEST_NEW_QUESTION_MODALS}
      />,
      { storeInitialState: createMockState({ settings: mockSettings({}) }) },
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

    describe("when no metabot command is provided", () => {
      it("should show all available commands except Metabot", async () => {
        setup({ metabotCommand: null });

        expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
        await expectStandardCommandsToBePresent();
      });
    });

    describe("when a metabot command is provided", () => {
      it("should show all available commands including Metabot", async () => {
        setup({ metabotCommand: { name: "Metabot" } });

        expect(await screen.findByText("Ask Metabot")).toBeInTheDocument();
        await expectStandardCommandsToBePresent();
      });

      it("should ask for a Metabot block when Ask Metabot is clicked", async () => {
        const { command } = setup({ metabotCommand: { name: "Metabot" } });

        await userEvent.click(
          await screen.findByRole("option", { name: "Ask Metabot" }),
        );

        expect(command).toHaveBeenCalledTimes(1);
        expect(command).toHaveBeenCalledWith({ command: "metabot" });
      });

      it("should use the provided metabot name", async () => {
        setup({ metabotCommand: { name: "Ada" } });

        expect(await screen.findByText("Ask Ada")).toBeInTheDocument();
        await expectStandardCommandsToBePresent();
      });
    });
  });

  describe("keyboard and mouse selection", () => {
    it("keeps exactly one option active while navigating commands and search results", async () => {
      // Recent items load asynchronously and reset the active option
      const { pressKey } = setup({
        metabotCommand: { name: "Metabot" },
        recentItems: [],
      });

      expect(
        await screen.findByRole("option", { name: "Ask Metabot" }),
      ).toBeInTheDocument();
      expectOnlyOptionActive("Ask Metabot");

      pressKey("ArrowDown");
      pressKey("ArrowDown");
      expectOnlyOptionActive("Link");

      await userEvent.hover(screen.getByRole("option", { name: "Quote" }));
      expectOnlyOptionActive("Quote");

      await userEvent.type(getQueryInput(), "Orders by");
      expect(
        await screen.findByRole("option", { name: /Orders by category/ }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole("option")).toHaveLength(2);
      expectOnlyOptionActive(/Orders by product/);

      pressKey("ArrowDown");
      expectOnlyOptionActive(/Orders by category/);

      await userEvent.hover(
        screen.getByRole("option", { name: /Orders by product/ }),
      );
      expectOnlyOptionActive(/Orders by product/);
    });

    it("resets the active option when the number of search results changes", async () => {
      const { pressKey } = setup({
        query: "Orders",
        searchItems: [
          ...SEARCH_ITEMS,
          createMockSearchResult({
            name: "Orders over time",
            model: "card",
            id: 7,
          }),
        ],
      });

      expect(
        await screen.findByRole("option", { name: /Orders over time/ }),
      ).toBeInTheDocument();
      pressKey("ArrowDown");
      expectOnlyOptionActive(/Orders by category/);

      await userEvent.type(getQueryInput(), " by");
      await waitFor(() =>
        expect(
          screen.queryByRole("option", { name: /Orders over time/ }),
        ).not.toBeInTheDocument(),
      );
      expectOnlyOptionActive(/Orders by product/);
    });
  });

  describe("new question type menu", () => {
    it("supports keyboard navigation from Chart to the native question modal", async () => {
      const { pressKey } = setup({
        recentItems: [],
        newQuestionOptions: NEW_QUESTION_OPTIONS,
        newQuestionModals: {
          notebook: () => null,
          native: NativeQuestionModalStub,
        },
      });

      expect(
        await screen.findByRole("option", { name: "Chart" }),
      ).toBeInTheDocument();
      expectOnlyOptionActive("Chart");
      pressKey("Enter");

      expect(
        await screen.findByRole("option", { name: /New chart/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /Browse all/ }),
      ).toBeInTheDocument();
      expectOnlyOptionActive(/New chart/);
      pressKey("Enter");

      expect(
        await screen.findByRole("option", { name: /New Question/ }),
      ).toBeInTheDocument();
      expectOnlyOptionActive(/New Question/);

      pressKey("ArrowDown");
      expectOnlyOptionActive(/New SQL query/);

      pressKey("Enter");
      const modal = await screen.findByRole("dialog", {
        name: "Native question modal",
      });

      await userEvent.click(
        within(modal).getByRole("button", { name: "Cancel" }),
      );
      expect(
        screen.queryByRole("dialog", { name: "Native question modal" }),
      ).not.toBeInTheDocument();
    });

    it("shows the 'New chart' and 'Browse all' footers when a Chart search has no results", async () => {
      setup({ newQuestionOptions: NEW_QUESTION_OPTIONS });

      await userEvent.click(
        await screen.findByRole("option", { name: "Chart" }),
      );
      await userEvent.type(getQueryInput(), "xyznonexistentquery");

      expect(await screen.findByText("No results found")).toBeInTheDocument();
      expect(
        within(getCommandDialog()).getByRole("separator"),
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /New chart/ })).toBeVisible();
      expect(screen.getByRole("option", { name: /Browse all/ })).toBeVisible();
    });

    it("opens the new question type menu on Enter when a command search has no results", async () => {
      const { pressKey } = setup({
        query: "asdfsdaf",
        newQuestionOptions: NEW_QUESTION_OPTIONS,
      });

      expect(await screen.findByText("No results found")).toBeInTheDocument();
      expect(
        await screen.findByRole("option", { name: /New chart/ }),
      ).toBeInTheDocument();
      expectOnlyOptionActive(/New chart/);

      pressKey("Enter");

      expect(
        await screen.findByRole("option", { name: /New Question/ }),
      ).toBeVisible();
      expect(
        within(getCommandDialog()).queryByText(/Browse all/),
      ).not.toBeInTheDocument();
    });
  });
});

const getQueryInput = () => screen.getByRole("textbox", { name: "test-input" });

const getCommandDialog = () => screen.getByLabelText("Command Dialog");

const expectOnlyOptionActive = (name: string | RegExp) => {
  expect(screen.getByRole("option", { name })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen
      .getAllByRole("option")
      .filter((option) => option.getAttribute("aria-selected") === "true"),
  ).toHaveLength(1);
};

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
