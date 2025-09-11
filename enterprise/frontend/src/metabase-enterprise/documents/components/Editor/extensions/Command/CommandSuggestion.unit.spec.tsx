import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Input } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";
import { type RecentItem, isRecentTableItem } from "metabase-types/api";
import {
  createMockRecentCollectionItem,
  createMockRecentTableItem,
  createMockSearchResult,
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
  settings = mockSettings({ "metabot-feature-enabled": true }),
}: SetupProps = {}) => {
  const command = jest.fn();

  const editor = {
    commands: {
      focus: jest.fn(),
    },
  };

  setupEnterprisePlugins();
  setupSearchEndpoints(SEARCH_ITEMS);
  setupRecentViewsEndpoints(RECENT_ITEMS);
  setupPropertiesEndpoints(settings.values);

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

    // Find cards what were searched for, with apropriate icons
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

  describe("metabot", () => {
    it("should not show Ask Metabot command when metabot is disabled", async () => {
      setup({
        settings: mockSettings({ "metabot-feature-enabled": false }),
      });

      expect(screen.queryByText("Ask Metabot")).not.toBeInTheDocument();
      await expectStandardCommandsToBePresent();
    });

    it("should show Ask Metabot command when metabot is enabled", async () => {
      setup();

      expect(await screen.findByText("Ask Metabot")).toBeInTheDocument();
      await expectStandardCommandsToBePresent();
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
