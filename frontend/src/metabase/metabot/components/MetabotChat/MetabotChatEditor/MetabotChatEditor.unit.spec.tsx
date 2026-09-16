import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/react";
import fetchMock from "fetch-mock";
import { createRef } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { setupSearchEndpoints } from "__support__/server-mocks/search";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import type { MetabotPromptInputRef } from "metabase/metabot";
import { mockDictationBrowser } from "metabase/metabot/tests/dictation";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import {
  createMockCard,
  createMockCollection,
  createMockDatabase,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSearchResult } from "metabase-types/api/mocks/search";

import { input } from "../../../tests/utils";

import { MetabotChatEditor } from "./MetabotChatEditor";

const defaultProps = {
  value: "",
  onChange: jest.fn(),
  onSubmit: jest.fn(),
  onStop: jest.fn(),
  suggestionConfig: {
    // Unjustified type cast. FIXME
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
  // Unjustified type cast. FIXME
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

const getPopup = () => screen.findByTestId("mini-picker");

describe("MetabotChatEditor dictation", () => {
  let browser: ReturnType<typeof mockDictationBrowser>;
  beforeEach(() => {
    browser = mockDictationBrowser();
    fetchMock.get(
      "path:/api/metabot/dictation",
      { enabled: true },
      { name: "dictation" },
    );
  });
  afterEach(() => browser.restore());

  function setupDictation(value = "Find birds today") {
    const ref = createRef<MetabotPromptInputRef>();
    const onSubmit = jest.fn<void, [string]>();
    setup({ ref, value, onSubmit, allowDictation: true });
    if (!(ref.current instanceof Editor)) {
      throw new Error("Expected a Tiptap editor");
    }
    return { editor: ref.current, ref, onSubmit };
  }

  it.each(["Stop dictation", "Send"])(
    "%s replaces the saved selection and only Send submits",
    async (action) => {
      fetchMock.post("path:/api/metabot/dictation", { text: "owls" });
      const { editor, onSubmit } = setupDictation();
      act(() => {
        editor.commands.setTextSelection({ from: 6, to: 11 });
      });
      await userEvent.click(
        await screen.findByRole("button", { name: "Dictate" }),
      );
      expect(editor.isEditable).toBe(false);
      await userEvent.click(
        await screen.findByRole("button", { name: action }),
      );
      await waitFor(() => expect(editor.getText()).toBe("Find owls today"));
      expect(editor.isEditable).toBe(true);
      expect(onSubmit.mock.calls).toEqual(
        action === "Send" ? [["Find owls today"]] : [],
      );
    },
  );

  it("preserves mentions and inserts multiline transcript as plain text", async () => {
    fetchMock.post("path:/api/metabot/dictation", {
      text: " <b>birds</b>\ntoday",
    });
    const { editor, ref, onSubmit } = setupDictation(
      "[Test Model](metabase://model/123)",
    );
    act(() => {
      editor.commands.focus("end");
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Dictate" }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        "[Test Model](metabase://model/123) <b>birds</b>\ntoday",
      ),
    );
    expect(ref.current?.getValue?.()).toBe(
      "[Test Model](metabase://model/123) <b>birds</b>\ntoday",
    );
  });

  it("cancel preserves the draft and does not submit or upload", async () => {
    const { editor, onSubmit } = setupDictation();
    await userEvent.click(
      await screen.findByRole("button", { name: "Dictate" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel dictation" }),
    );
    expect(editor.getText()).toBe("Find birds today");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(browser.track.stop).toHaveBeenCalled();
    expect(
      fetchMock.callHistory.calls("path:/api/metabot/dictation", {
        method: "POST",
      }),
    ).toHaveLength(0);
  });

  it("allows returning to typing after permission is denied", async () => {
    browser.getUserMedia.mockRejectedValue(
      new DOMException("", "NotAllowedError"),
    );
    const { editor } = setupDictation();
    await userEvent.click(
      await screen.findByRole("button", { name: "Dictate" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Microphone access was denied",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Cancel dictation" }),
    );
    expect(editor.isEditable).toBe(true);
    expect(editor.getText()).toBe("Find birds today");
  });

  it("hides dictation when there is no OpenAI connection", async () => {
    fetchMock.modifyRoute("dictation", { response: { enabled: false } });
    setupDictation();
    await waitFor(() =>
      expect(fetchMock.callHistory.called("path:/api/metabot/dictation")).toBe(
        true,
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Dictate" }),
    ).not.toBeInTheDocument();
  });
});

describe("MetabotChatEditor", () => {
  it("should convert text value to formatted tiptap", async () => {
    setup({ value: "[Test Model](metabase://model/123)" });

    const editor = await screen.findByTestId("metabot-chat-input");
    await waitFor(() => expect(editor).toHaveTextContent("Test Model"));
  });

  it("should emit onChange events with properly serialized content", async () => {
    const onChange = jest.fn();
    setup({ onChange });

    await userEvent.type(await input(), "Hello world");

    expect(onChange).toHaveBeenCalledWith("Hello world");
  });

  it("should emit onSubmit events with properly serialized content", async () => {
    const onSubmit = jest.fn();
    setup({ onSubmit });

    await userEvent.type(await input(), "Hello world{Enter}");

    expect(onSubmit).toHaveBeenCalled();
  });

  it("should support @mentions", async () => {
    setup();

    await userEvent.type(await input(), "@");

    expect(await getPopup()).toBeInTheDocument();
  });

  it("should show browse all when @ is typed", async () => {
    setup();

    await userEvent.type(await input(), "@");

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

    await userEvent.type(await input(), "@sample");

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

    await userEvent.type(await input(), "@test");

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

    await userEvent.type(await input(), "@test");

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
    (await input()).focus();

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

    await userEvent.type(await input(), "Hello world{Enter}");

    expect(onSubmit).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith("Hello world");
  });
});
