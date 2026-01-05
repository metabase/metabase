import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCardEndpoints,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { setupSearchEndpoints } from "__support__/server-mocks/search";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import { createMockCard, createMockUser } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
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

const setup = (props = {}) => {
  setupEnterprisePlugins();
  setupCardEndpoints(createMockCard({ id: 123, name: "Test Model" }));
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
const getPopup = () => screen.findByTestId("mention-suggestions-popup");

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

  it("should show available models when @ is typed", async () => {
    setup();

    await userEvent.type(getEditor(), "@");

    const popup = await getPopup();
    expect(popup).toBeInTheDocument();
    expect(await screen.findByText("Table")).toBeInTheDocument();
    expect(await screen.findByText("Database")).toBeInTheDocument();
    expect(await screen.findByText("Collection")).toBeInTheDocument();
  });

  it("should filter available models when @d is typed", async () => {
    setup();

    await userEvent.type(getEditor(), "@d");

    const popup = await getPopup();
    expect(popup).toBeInTheDocument();
    expect(await screen.findByText("Database")).toBeInTheDocument();
    expect(screen.queryByText("Table")).not.toBeInTheDocument();
  });

  it("should only search selected @mention model when selected", async () => {
    const db = createSampleDatabase();
    setupDatabaseEndpoints(db);
    setupSearchEndpoints([
      createMockSearchResult({
        id: db.id,
        name: db.name,
        model: "database",
      }),
    ]);
    setup();

    await userEvent.type(getEditor(), "@d{Enter}Sample");
    expect(getEditor()).toHaveTextContent("@Sample");

    expect(await screen.findByText("Sample Database")).toBeInTheDocument();

    await userEvent.keyboard("{Enter}");

    expect(getEditor()).toHaveTextContent("Sample Database");
  });

  it("should search all models if @mention input doesn't match any search model name", async () => {
    setupSearchEndpoints([
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
    ]);
    setup();

    await userEvent.type(getEditor(), "@test");

    expect(await screen.findByText("Test Card")).toBeInTheDocument();
    expect(await screen.findByText("Test Dashboard")).toBeInTheDocument();
    expect(await screen.findByText("Test Collection")).toBeInTheDocument();
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
