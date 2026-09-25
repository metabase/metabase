import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { type Ref, createRef, forwardRef, useState } from "react";

import {
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
import type { RecentItem } from "metabase-types/api";
import {
  createMockDatabase,
  createMockRecentCollectionItem,
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

const NOTEBOOK_OPTION: NewQuestionOption = {
  value: "notebook",
  label: "New Question",
  icon: "insight",
};

const NATIVE_OPTION: NewQuestionOption = {
  value: "native",
  label: "New SQL query",
  icon: "sql",
};

const SEARCH_ITEMS = [
  createMockSearchResult({
    name: "Orders by product",
    model: "card",
    display: "bar",
    id: 1,
  }),
];

const RECENT_ITEMS = [
  createMockRecentCollectionItem({
    id: 2,
    name: "Recent Card",
    model: "card",
    display: "bar",
  }),
];

const StubModal =
  (name: string) =>
  ({ onClose }: NewQuestionModalProps) => (
    <div role="dialog" aria-label={name}>
      <button onClick={onClose}>{`Cancel ${name}`}</button>
    </div>
  );

const NEW_QUESTION_MODALS: NewQuestionModals = {
  notebook: StubModal("Notebook modal"),
  native: StubModal("Native modal"),
};

const TestWrapper = forwardRef(function TestWrapper(
  props: CommandSuggestionProps,
  ref: Ref<CommandSuggestionRef>,
) {
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
});

type SetupOpts = {
  query?: string;
  newQuestionOptions?: NewQuestionOption[];
  recentItems?: RecentItem[];
};

const setup = ({
  query = "",
  newQuestionOptions = [NOTEBOOK_OPTION, NATIVE_OPTION],
  recentItems = [],
}: SetupOpts = {}) => {
  const ref = createRef<CommandSuggestionRef>();
  const editor = {
    commands: { focus: jest.fn() },
    schema: { nodes: {} },
    isActive: jest.fn(),
  };

  setupSearchEndpoints(SEARCH_ITEMS);
  setupRecentViewsEndpoints(recentItems);
  setupDatabasesEndpoints([createMockDatabase()]);

  renderWithProviders(
    <TestWrapper
      ref={ref}
      command={jest.fn()}
      // Unjustified type cast. FIXME
      editor={editor as unknown as Editor}
      query={query}
      items={[]}
      range={{ from: 0, to: 0 }}
      newQuestionOptions={newQuestionOptions}
      newQuestionModals={NEW_QUESTION_MODALS}
    />,
    { storeInitialState: createMockState({ settings: mockSettings({}) }) },
  );

  const pressKey = (key: string) =>
    act(() => {
      ref.current?.onKeyDown({ event: new KeyboardEvent("keydown", { key }) });
    });

  return { pressKey };
};

const commandDialog = () => screen.getByRole("dialog", { name: "Command Dialog" });

const expectSelectedOption = async (name: string | RegExp) => {
  expect(await screen.findByRole("option", { name })).toHaveAttribute(
    "aria-selected",
    "true",
  );
};

const typeQuery = (text: string) =>
  userEvent.type(screen.getByRole("textbox", { name: "test-input" }), text);

describe("CommandSuggestion > new question", () => {
  it("supports keyboard navigation from the command list to a new SQL question", async () => {
    const { pressKey } = setup();

    await expectSelectedOption("Chart");
    pressKey("Enter");

    await expectSelectedOption(/New chart/);
    expect(
      await screen.findByRole("option", { name: /Browse all/ }),
    ).toBeInTheDocument();
    pressKey("Enter");

    await expectSelectedOption(/New Question/);
    pressKey("ArrowDown");
    await expectSelectedOption(/New SQL query/);
    pressKey("Enter");

    expect(
      await screen.findByRole("dialog", { name: "Native modal" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Cancel Native modal" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Native modal" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("option", { name: "Chart" }),
    ).toBeInTheDocument();
  });

  it("shows the 'New chart' and 'Browse all' footers when a chart search has no results", async () => {
    setup();

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));
    await typeQuery("xyznonexistentquery");

    expect(
      await within(commandDialog()).findByText("No results found"),
    ).toBeInTheDocument();
    expect(within(commandDialog()).getByRole("separator")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /New chart/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Browse all/ }),
    ).toBeInTheDocument();
  });

  it("opens the new question type menu when pressing Enter on a command search with no results", async () => {
    const { pressKey } = setup({ query: "asdfsdaf" });

    expect(
      await within(commandDialog()).findByText("No results found"),
    ).toBeInTheDocument();
    await expectSelectedOption(/New chart/);

    pressKey("Enter");

    expect(
      await screen.findByRole("option", { name: /New Question/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Browse all/ }),
    ).not.toBeInTheDocument();
  });

  it("does not offer 'New chart' when the user cannot create questions", async () => {
    setup({ newQuestionOptions: [], recentItems: RECENT_ITEMS });

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));

    expect(
      await screen.findByRole("option", { name: /Recent Card/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Browse all/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /New chart/ }),
    ).not.toBeInTheDocument();

    await typeQuery("xyznonexistent");

    expect(
      await within(commandDialog()).findByText("No results found"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Browse all/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /New chart/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the notebook modal directly when it is the only new question option", async () => {
    setup({
      newQuestionOptions: [NOTEBOOK_OPTION],
      recentItems: RECENT_ITEMS,
    });

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));
    await userEvent.click(
      await screen.findByRole("option", { name: /New chart/ }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Notebook modal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /New Question/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /New SQL query/ }),
    ).not.toBeInTheDocument();
  });
});
