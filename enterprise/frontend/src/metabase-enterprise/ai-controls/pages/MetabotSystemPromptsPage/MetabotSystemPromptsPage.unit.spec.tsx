import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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

  renderWithProviders(<Component />);
}

describe("MetabotSystemPromptsPage", () => {
  describe("MetabotChatPromptPage", () => {
    it("renders with the correct title", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
      });

      expect(
        await screen.findByText("Metabot chat prompt instructions"),
      ).toBeInTheDocument();
    });

    it("renders the textarea with existing prompt value", async () => {
      setup({
        Component: MetabotChatPromptPage,
        settingKey: "metabot-chat-system-prompt",
        settingValue: "Be concise and helpful",
      });

      const textarea = await screen.findByRole("textbox", {
        name: "Metabot chat prompt instructions",
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
        name: "Metabot chat prompt instructions",
      });
      await userEvent.type(textarea, "New instructions");

      await waitFor(() => {
        expect(textarea).toHaveValue("New instructions");
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
