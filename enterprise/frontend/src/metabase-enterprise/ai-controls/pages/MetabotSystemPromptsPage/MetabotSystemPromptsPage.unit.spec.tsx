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

type SystemPromptSettingKey =
  | "metabot-chat-system-prompt"
  | "metabot-nlq-system-prompt"
  | "metabot-sql-system-prompt";

const PAGES = [
  {
    Component: MetabotChatPromptPage,
    settingKey: "metabot-chat-system-prompt" as const,
    title: "AI chat prompt instructions",
  },
  {
    Component: NaturalLanguagePromptPage,
    settingKey: "metabot-nlq-system-prompt" as const,
    title: "Natural language query prompt instructions",
  },
  {
    Component: SqlGenerationPromptPage,
    settingKey: "metabot-sql-system-prompt" as const,
    title: "SQL generation prompt instructions",
  },
];

async function setup({
  Component,
  settingKey,
  title,
  settingValue = "",
}: {
  Component: React.ComponentType;
  settingKey: SystemPromptSettingKey;
  title: string;
  settingValue?: string | null;
}) {
  setupPropertiesEndpoints(
    createMockSettings({
      [settingKey]: settingValue,
    }),
  );
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  const view = renderWithProviders(
    <>
      <Component />
      <UndoListing />
    </>,
  );
  const textarea = await screen.findByRole("textbox", { name: title });
  // Wait for the hook to hydrate inputValue from the loaded setting.
  await waitFor(() => expect(textarea).toHaveValue(settingValue ?? ""));
  return { ...view, textarea };
}

function getUpdateCallsFor(settingKey: SystemPromptSettingKey) {
  return fetchMock.callHistory.calls(`path:/api/setting/${settingKey}`, {
    method: "PUT",
  });
}

describe("MetabotSystemPromptsPage", () => {
  describe.each(PAGES)("$title", ({ Component, settingKey, title }) => {
    it("renders the page with the existing prompt value", async () => {
      const { textarea } = await setup({
        Component,
        settingKey,
        title,
        settingValue: "Existing value",
      });

      expect(screen.getByText(title)).toBeInTheDocument();
      expect(textarea).toHaveValue("Existing value");
    });
  });

  describe("MetabotChatPromptPage save behavior", () => {
    const chatPage = PAGES[0];
    const getChatSaves = () => getUpdateCallsFor(chatPage.settingKey);

    it("saves on blur and shows a 'Changes saved' toast", async () => {
      const { textarea } = await setup(chatPage);

      await userEvent.type(textarea, "Be concise");
      fireEvent.blur(textarea);

      await waitFor(() => expect(getChatSaves()).toHaveLength(1));
      const [call] = getChatSaves();
      expect(await call?.request?.json()).toEqual({ value: "Be concise" });
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    });

    it("does not save if the user types and reverts before blurring", async () => {
      const { textarea } = await setup({
        ...chatPage,
        settingValue: "Existing prompt",
      });

      await userEvent.click(textarea);
      await userEvent.type(textarea, "x{Backspace}");
      fireEvent.blur(textarea);

      expect(getChatSaves()).toHaveLength(0);
    });

    it("does not save if only the leading/trailing whitespace changes", async () => {
      const { textarea } = await setup({ ...chatPage, settingValue: "hello" });

      await userEvent.click(textarea);
      await userEvent.type(textarea, "   ");
      fireEvent.blur(textarea);

      expect(getChatSaves()).toHaveLength(0);
    });

    it("trims leading and trailing whitespace before saving", async () => {
      const { textarea } = await setup(chatPage);

      await userEvent.type(textarea, "  hello world  ");
      fireEvent.blur(textarea);

      await waitFor(() => expect(getChatSaves()).toHaveLength(1));
      const [call] = getChatSaves();
      expect(await call?.request?.json()).toEqual({ value: "hello world" });
    });

    it("saves each distinct value across consecutive edit cycles", async () => {
      const { textarea } = await setup(chatPage);

      await userEvent.type(textarea, "First");
      fireEvent.blur(textarea);
      await waitFor(() => expect(getChatSaves()).toHaveLength(1));

      await userEvent.type(textarea, " edit");
      fireEvent.blur(textarea);
      await waitFor(() => expect(getChatSaves()).toHaveLength(2));

      const calls = getChatSaves();
      expect(await calls[0]?.request?.json()).toEqual({ value: "First" });
      expect(await calls[1]?.request?.json()).toEqual({ value: "First edit" });
    });

    it("toggles the beforeunload guard with the dirty state", async () => {
      const { textarea } = await setup(chatPage);

      await userEvent.type(textarea, "Pending");

      const dirtyEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(dirtyEvent);
      expect(dirtyEvent.defaultPrevented).toBe(true);

      fireEvent.blur(textarea);
      await waitFor(() => expect(getChatSaves()).toHaveLength(1));

      const cleanEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(cleanEvent);
      expect(cleanEvent.defaultPrevented).toBe(false);
    });

    it("saves a pending edit when the page unmounts", async () => {
      // Covers SPA navigation away mid-edit (e.g. browser back), where blur
      // never fires on the focused textarea.
      const { textarea, unmount } = await setup(chatPage);

      await userEvent.type(textarea, "Half-typed");
      unmount();

      await waitFor(() => expect(getChatSaves()).toHaveLength(1));
    });
  });
});
