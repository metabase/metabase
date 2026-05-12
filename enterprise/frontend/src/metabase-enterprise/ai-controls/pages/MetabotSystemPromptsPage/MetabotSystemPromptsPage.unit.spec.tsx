import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockSettings } from "metabase-types/api/mocks";

import {
  MetabotChatPromptPage,
  NaturalLanguagePromptPage,
  SqlGenerationPromptPage,
} from "./MetabotSystemPromptsPage";

function setup({
  Component,
  settingKey,
  settingValue = "",
}: {
  Component: React.ComponentType;
  settingKey:
    | "metabot-chat-system-prompt"
    | "metabot-nlq-system-prompt"
    | "metabot-sql-system-prompt";
  settingValue?: string | null;
}) {
  setupPropertiesEndpoints(
    createMockSettings({
      [settingKey]: settingValue,
    }),
  );
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  return renderWithProviders(
    <>
      <Component />
      <UndoListing />
    </>,
  );
}

function getUpdateCallsFor(settingKey: string) {
  return fetchMock.callHistory.calls(`path:/api/setting/${settingKey}`, {
    method: "PUT",
  });
}

describe("MetabotSystemPromptsPage", () => {
  describe("MetabotChatPromptPage", () => {
    it("renders with the correct title", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
      });

      expect(
        await screen.findByText("AI chat prompt instructions"),
      ).toBeInTheDocument();
    });

    it("renders the textarea with existing prompt value", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
        settingValue: "Be concise and helpful",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "AI chat prompt instructions",
      });

      await waitFor(() => {
        expect(textarea).toHaveValue("Be concise and helpful");
      });
    });

    it("updates the textarea value when user types", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "AI chat prompt instructions",
      });
      await userEvent.type(textarea, "New instructions");

      await waitFor(() => {
        expect(textarea).toHaveValue("New instructions");
      });
    });

    it("does not save while the user is typing", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "AI chat prompt instructions",
      });
      await userEvent.type(textarea, "Some prompt");

      expect(getUpdateCallsFor("metabot-chat-system-prompt")).toHaveLength(0);
    });

    it("saves on blur and shows a 'Changes saved' toast", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "AI chat prompt instructions",
      });
      await userEvent.type(textarea, "Be concise");
      fireEvent.blur(textarea);

      await waitFor(() => {
        expect(getUpdateCallsFor("metabot-chat-system-prompt")).toHaveLength(1);
      });

      const [call] = getUpdateCallsFor("metabot-chat-system-prompt");
      expect(await call?.request?.json()).toEqual({ value: "Be concise" });

      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    });

    it("does not re-save on blur if the value did not change", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
        settingValue: "Existing prompt",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "AI chat prompt instructions",
      });
      await waitFor(() => {
        expect(textarea).toHaveValue("Existing prompt");
      });

      fireEvent.focus(textarea);
      fireEvent.blur(textarea);

      expect(getUpdateCallsFor("metabot-chat-system-prompt")).toHaveLength(0);
    });

    it("saves each distinct value across consecutive edit cycles", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "AI chat prompt instructions",
      });

      await userEvent.type(textarea, "First");
      fireEvent.blur(textarea);
      await waitFor(() => {
        expect(getUpdateCallsFor("metabot-chat-system-prompt")).toHaveLength(1);
      });

      await userEvent.type(textarea, " edit");
      fireEvent.blur(textarea);
      await waitFor(() => {
        expect(getUpdateCallsFor("metabot-chat-system-prompt")).toHaveLength(2);
      });

      const calls = getUpdateCallsFor("metabot-chat-system-prompt");
      expect(await calls[0]?.request?.json()).toEqual({ value: "First" });
      expect(await calls[1]?.request?.json()).toEqual({ value: "First edit" });
    });

    it("warns about unsaved edits via beforeunload, but stops once saved", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "AI chat prompt instructions",
      });
      await userEvent.type(textarea, "Pending");

      const dirtyEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(dirtyEvent);
      expect(dirtyEvent.defaultPrevented).toBe(true);

      fireEvent.blur(textarea);
      await waitFor(() => {
        expect(getUpdateCallsFor("metabot-chat-system-prompt")).toHaveLength(1);
      });

      const cleanEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(cleanEvent);
      expect(cleanEvent.defaultPrevented).toBe(false);
    });

    it("saves a pending edit when the page unmounts", async () => {
      const { unmount } = setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "AI chat prompt instructions",
      });
      await userEvent.type(textarea, "Half-typed");
      // No blur - simulate navigating away mid-edit.
      unmount();

      await waitFor(() => {
        expect(getUpdateCallsFor("metabot-chat-system-prompt")).toHaveLength(1);
      });
    });
  });

  describe("NaturalLanguagePromptPage", () => {
    it("renders with the correct title", async () => {
      setup({
        Component: NaturalLanguagePromptPage,
        settingKey: "metabot-nlq-system-prompt",
      });

      expect(
        await screen.findByText("Natural language query prompt instructions"),
      ).toBeInTheDocument();
    });

    it("renders the textarea with existing prompt value", async () => {
      setup({
        Component: NaturalLanguagePromptPage,
        settingKey: "metabot-nlq-system-prompt",
        settingValue: "Prefer bar charts",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "Natural language query prompt instructions",
      });
      await waitFor(() => {
        expect(textarea).toHaveValue("Prefer bar charts");
      });
    });
  });

  describe("SqlGenerationPromptPage", () => {
    it("renders with the correct title", async () => {
      setup({
        Component: SqlGenerationPromptPage,
        settingKey: "metabot-sql-system-prompt",
      });

      expect(
        await screen.findByText("SQL generation prompt instructions"),
      ).toBeInTheDocument();
    });

    it("renders the textarea with existing prompt value", async () => {
      setup({
        Component: SqlGenerationPromptPage,
        settingKey: "metabot-sql-system-prompt",
        settingValue: "Use uppercase SQL keywords",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "SQL generation prompt instructions",
      });
      await waitFor(() => {
        expect(textarea).toHaveValue("Use uppercase SQL keywords");
      });
    });
  });
});
