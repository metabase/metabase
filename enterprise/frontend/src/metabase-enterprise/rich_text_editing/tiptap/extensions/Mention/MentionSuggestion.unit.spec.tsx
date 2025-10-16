import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import fetchMock from "fetch-mock";

import {
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import {
  createMockRecentCollectionItem,
  createMockSearchResult,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { MentionSuggestionProps } from "./MentionSuggestion";
import { MentionSuggestion } from "./MentionSuggestion";

const expectOptionToBePresent = async (name: string | RegExp) => {
  expect(await screen.findByRole("option", { name })).toBeInTheDocument();
};

const expectOptionNotToBePresent = (name: string | RegExp) => {
  expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
};

const SEARCH_ITEMS = [
  createMockSearchResult({
    name: "Orders question",
    model: "card",
    id: 1,
  }),
];

const RECENT_ITEMS = [
  createMockRecentCollectionItem({
    id: 4,
    name: "Recent Card",
    model: "card",
  }),
];

interface SetupProps extends Partial<MentionSuggestionProps> {
  query?: string;
  searchItems?: typeof SEARCH_ITEMS;
  recentItems?: typeof RECENT_ITEMS;
}

const setup = (props: SetupProps = {}) => {
  const command = jest.fn();

  const mockChain = {
    focus: jest.fn().mockReturnThis(),
    deleteRange: jest.fn().mockReturnThis(),
    insertContent: jest.fn().mockReturnThis(),
    run: jest.fn().mockReturnThis(),
  };

  const editor = {
    commands: {
      focus: jest.fn(),
      deleteRange: jest.fn().mockReturnThis(),
      insertContent: jest.fn().mockReturnThis(),
      run: jest.fn(),
    },
    chain: jest.fn().mockReturnValue(mockChain),
  } as unknown as Editor;

  setupSearchEndpoints(props.searchItems ?? SEARCH_ITEMS);
  setupRecentViewsEndpoints(props.recentItems ?? RECENT_ITEMS);

  const defaultProps: MentionSuggestionProps = {
    items: [],
    command,
    editor,
    range: { from: 0, to: 0 },
    query: props.query || "",
    ...props,
  };

  renderWithProviders(<MentionSuggestion {...defaultProps} />, {
    storeInitialState: createMockState({}),
  });

  return { command, editor };
};

describe("MentionSuggestion", () => {
  it("shows recent items for empty query", async () => {
    setup({ query: "" });
    await expectOptionToBePresent(/Recent Card/);
  });

  it("shows 'Browse all' when canBrowseAll=true", async () => {
    setup({ query: "", canBrowseAll: true });
    await expectOptionToBePresent(/Recent Card/);
    expect(screen.getByText("Browse all")).toBeInTheDocument();
  });

  it("hides 'Browse all' when canBrowseAll=false", async () => {
    setup({ query: "", canBrowseAll: false });
    await expectOptionToBePresent(/Recent Card/);
    expect(screen.queryByText("Browse all")).not.toBeInTheDocument();
  });

  it("searches without model filtering when none provided", async () => {
    setup({ query: "ord" });
    await expectOptionToBePresent(/Orders question/);
    expectOptionNotToBePresent(/Recent Card/);
  });

  it("shows model selector for empty query with searchModels", async () => {
    setup({ query: "", searchModels: ["card", "dashboard", "table"] });
    await expectOptionToBePresent(/Question/);
    await expectOptionToBePresent(/Dashboard/);
    await expectOptionToBePresent(/Table/);
  });

  it("filters search by selected model and shows model name", async () => {
    const { editor } = setup({
      query: "",
      searchModels: ["card", "dashboard", "table"],
      searchItems: [
        createMockSearchResult({
          name: "Sales Dashboard",
          model: "dashboard",
          id: 10,
        }),
      ],
    });

    await userEvent.click(
      await screen.findByRole("option", {
        name: /Dashboard/,
      }),
    );
    expect(editor.chain).toHaveBeenCalled();
    const chainMethods = editor.chain();
    expect(chainMethods.focus).toHaveBeenCalled();
    expect(chainMethods.deleteRange).toHaveBeenCalled();
    expect(chainMethods.insertContent).toHaveBeenCalledWith("@");
    expect(chainMethods.run).toHaveBeenCalled();

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    await expectOptionToBePresent(/Sales Dashboard/);

    const call = fetchMock.callHistory.lastCall("path:/api/search");
    const urlObject = new URL(checkNotNull(call?.request?.url));
    expect(urlObject.searchParams.get("models")).toEqual("dashboard");
  });

  it("filters model selector by query text", async () => {
    setup({
      query: "que",
      searchModels: ["card", "dashboard", "table"],
    });

    await expectOptionToBePresent(/Question/);
    expectOptionNotToBePresent(/Dashboard/);
    expectOptionNotToBePresent(/Table/);
  });

  it("behaves as standard mention without searchModels", async () => {
    setup({ query: "" });

    await expectOptionToBePresent(/Recent Card/);
    expect(screen.getByText("Browse all")).toBeInTheDocument();
    expectOptionNotToBePresent(/Question/);
    expectOptionNotToBePresent(/Dashboard/);
  });

  it("searches all models when query doesn't match any model name", async () => {
    setup({
      query: "Sales", // Doesn't match any model name
      searchModels: ["card", "dashboard", "table"],
      searchItems: [
        createMockSearchResult({ name: "Sales Card", model: "card", id: 11 }),
        createMockSearchResult({
          name: "Sales Dashboard",
          model: "dashboard",
          id: 12,
        }),
        createMockSearchResult({
          name: "Sales Table",
          model: "table",
          id: 13,
        }),
      ],
    });

    expect(
      await screen.findAllByRole("option", { name: /Sales/ }),
    ).toHaveLength(3);
    const call = fetchMock.callHistory.lastCall("path:/api/search");
    const urlObject = new URL(checkNotNull(call?.request?.url));
    const models = urlObject.searchParams.getAll("models").sort();
    expect(models).toEqual(["card", "dashboard", "table"]);
  });
});
