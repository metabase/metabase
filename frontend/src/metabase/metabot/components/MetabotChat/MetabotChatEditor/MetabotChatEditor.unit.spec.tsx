import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { setupSearchEndpoints } from "__support__/server-mocks/search";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import {
  createMockCard,
  createMockCollection,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSearchResult } from "metabase-types/api/mocks/search";
import { createMockState } from "metabase-types/store/mocks";

import { MetabotChatEditor } from "./MetabotChatEditor";

const defaultProps = {
  value: "",
  onChange: jest.fn(),
  onSubmit: jest.fn(),
  onStop: jest.fn(),
  suggestionConfig: {
    suggestionModels: [
      "table",
      "database",
      "card",
      "dashboard",
      "collection",
    ] as SuggestionModel[],
  },
};

// "fetch-mock" can accept an array, the types are incorrect
const asFetchMockModelParams = (models: string[]) =>
  models as unknown as string;

const setup = (
  props = {},
  {
    searchItems = [],
  }: { searchItems?: ReturnType<typeof createMockSearchResult>[] } = {},
) => {
  setupEnterprisePlugins();
  setupCardEndpoints(createMockCard({ id: 123, name: "Test Model" }));
  setupDatabasesEndpoints(
    [createMockDatabase({ id: 1, name: "DB 1" })],
    {},
    {
      "can-query": true,
    },
  );
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });
  setupSearchEndpoints(searchItems);
  const settings = mockSettings({ "site-url": "http://localhost:3000" });

  return renderWithProviders(
    <MetabotChatEditor {...defaultProps} {...props} />,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser(),
      }),
    },
  );
};

const getEditor = () =>
  // eslint-disable-next-line testing-library/no-node-access
  document.querySelector('[contenteditable="true"]')! as HTMLElement;
const getPopup = () => screen.findByTestId("mini-picker");

describe("MetabotChatEditor", () => {
  it("should convert text value to formatted tiptap", async () => {
    setup({ value: "[Test Model](metabase://model/123)" });

    const editor = await screen.findByTestId("metabot-chat-input");
    expect(editor).toHaveTextContent("Test Model");
  });

  it("should emit onChange events with properly serialized content", async () => {
    const onChange = jest.fn();
    setup({ onChange });

    await userEvent.type(getEditor(), "Hello world");

    expect(onChange).toHaveBeenCalledWith("Hello world");
  });

  it("should emit onSubmit events with properly serialized content", async () => {
    const onSubmit = jest.fn();
    setup({ onSubmit });

    await userEvent.type(getEditor(), "Hello world{Enter}");

    expect(onSubmit).toHaveBeenCalled();
  });

  it("should support @mentions", async () => {
    setup();

    await userEvent.type(getEditor(), "@");

    expect(await getPopup()).toBeInTheDocument();
  });

  it("should show browse all when @ is typed", async () => {
    setup();

    await userEvent.type(getEditor(), "@");

    const popup = await getPopup();
    expect(popup).toBeInTheDocument();
    expect(await screen.findByText("Browse all")).toBeInTheDocument();
  });

  it("should query search endpoint when typing mention query", async () => {
    setup(
      {},
      {
        searchItems: [
          createMockSearchResult({
            id: 1234,
            name: "Sample card",
            model: "card",
          }),
        ],
      },
    );

    await userEvent.type(getEditor(), "@sample");

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/search", {
          query: { q: "sample" },
        }),
      ).toBeTruthy();
    });
  });

  it("should search all models if @mention input doesn't match any search model name", async () => {
    setup(
      {},
      {
        searchItems: [
          createMockSearchResult({ id: 1, name: "Test Card", model: "card" }),
          createMockSearchResult({
            id: 2,
            name: "Test Dashboard",
            model: "dashboard",
          }),
          createMockSearchResult({
            id: 3,
            name: "Test Collection",
            model: "collection",
          }),
        ],
      },
    );

    await userEvent.type(getEditor(), "@test");

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/search").length,
      ).toBeGreaterThan(0),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/search", {
          query: {
            q: "test",
            models: asFetchMockModelParams([
              "table",
              "card",
              "dashboard",
              "collection",
            ]),
          },
        }),
      ).toBeTruthy();
    });
  });

  it("requests search with allowed models for @mentions", async () => {
    setup(
      {},
      {
        searchItems: [
          createMockSearchResult({ id: 1, name: "Test card", model: "card" }),
        ],
      },
    );

    await userEvent.type(getEditor(), "@test");

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/search", {
          query: {
            q: "test",
            models: asFetchMockModelParams([
              "table",
              "card",
              "dashboard",
              "collection",
            ]),
          },
        }),
      ).toBeTruthy();
    });
  });

  it("should handle paste events with metabase protocol links", async () => {
    const onChange = jest.fn();
    setup({ onChange });
    getEditor().focus();

    await userEvent.paste("[Test Model](metabase://model/123)");

    expect(await screen.findByText("Test Model")).toBeInTheDocument();
    expect(
      screen.queryByText("[Test Model](metabase://model/123)"),
    ).not.toBeInTheDocument();
  });

  it("should clear editor after submit", async () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    setup({ value: "", onChange, onSubmit });

    await userEvent.type(getEditor(), "Hello world{Enter}");

    expect(onSubmit).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith("Hello world");
  });
});
