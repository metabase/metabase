import userEvent from "@testing-library/user-event";
import type { Editor } from "@tiptap/core";
import { useState } from "react";

import {
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Input } from "metabase/ui";
import type { UserPermissions } from "metabase-types/api";
import {
  createMockDatabase,
  createMockRecentCollectionItem,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { DocumentCommandSuggestion } from "./DocumentCommandSuggestion";

jest.mock(
  "../editor-extensions/CardEmbed/modals/CreateStructuredQuestionModal",
  () => ({
    CreateStructuredQuestionModal: () => (
      <div role="dialog" aria-label="Notebook question modal" />
    ),
  }),
);

jest.mock(
  "../editor-extensions/CardEmbed/modals/CreateNativeQuestionModal",
  () => ({
    CreateNativeQuestionModal: () => (
      <div role="dialog" aria-label="Native question modal" />
    ),
  }),
);

const RECENT_CARD = createMockRecentCollectionItem({
  id: 1,
  name: "Recent Card",
  model: "card",
  display: "bar",
});

const QueryWrapper = ({ editor }: { editor: Editor }) => {
  const [query, setQuery] = useState("");

  return (
    <>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="query"
      />
      <DocumentCommandSuggestion
        command={jest.fn()}
        editor={editor}
        query={query}
        items={[]}
        range={{ from: 0, to: 0 }}
      />
    </>
  );
};

interface SetupOpts {
  permissions: Partial<UserPermissions>;
}

const setup = ({ permissions }: SetupOpts) => {
  setupSearchEndpoints([]);
  setupRecentViewsEndpoints([RECENT_CARD]);
  setupDatabasesEndpoints([
    createMockDatabase({ native_permissions: "write" }),
  ]);

  const editor = {
    commands: { focus: jest.fn() },
    schema: { nodes: {} },
    isActive: jest.fn().mockReturnValue(false),
  };

  renderWithProviders(
    <QueryWrapper
      // The suggestion menu only reads `commands`, `schema` and `isActive` from the editor
      editor={editor as unknown as Editor}
    />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({
          permissions: createMockUserPermissions(permissions),
        }),
        settings: mockSettings({ "metabot-enabled?": false }),
      }),
    },
  );
};

const getCommandDialog = () => screen.getByLabelText("Command Dialog");

describe("DocumentCommandSuggestion", () => {
  it("does not offer to create a new chart without data permissions", async () => {
    setup({
      permissions: {
        can_create_queries: false,
        can_create_native_queries: false,
      },
    });

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));

    expect(
      await within(getCommandDialog()).findByText("Recent Card"),
    ).toBeInTheDocument();
    expect(within(getCommandDialog()).getByText("Browse all")).toBeVisible();
    expect(
      within(getCommandDialog()).queryByText("New chart"),
    ).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("query"), "xyznonexistent");

    expect(
      await within(getCommandDialog()).findByText("No results found"),
    ).toBeInTheDocument();
    expect(within(getCommandDialog()).getByText("Browse all")).toBeVisible();
    expect(
      within(getCommandDialog()).queryByText("New chart"),
    ).not.toBeInTheDocument();
  });

  it("only offers a notebook question without native query permissions", async () => {
    setup({
      permissions: {
        can_create_queries: true,
        can_create_native_queries: false,
      },
    });

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));
    await userEvent.click(
      await within(getCommandDialog()).findByText("New chart"),
    );

    expect(
      await screen.findByRole("dialog", { name: "Notebook question modal" }),
    ).toBeInTheDocument();
    expect(
      within(getCommandDialog()).getByText("New Question"),
    ).toBeInTheDocument();
    expect(
      within(getCommandDialog()).queryByText("New SQL query"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Native question modal" }),
    ).not.toBeInTheDocument();
  });

  it("offers both notebook and SQL questions with native query permissions", async () => {
    setup({
      permissions: {
        can_create_queries: true,
        can_create_native_queries: true,
      },
    });

    await userEvent.click(await screen.findByRole("option", { name: "Chart" }));
    await userEvent.click(
      await within(getCommandDialog()).findByText("New chart"),
    );

    expect(
      await within(getCommandDialog()).findByText("New Question"),
    ).toBeInTheDocument();
    expect(
      within(getCommandDialog()).getByText("New SQL query"),
    ).toBeInTheDocument();
  });
});
