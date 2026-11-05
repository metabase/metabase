import { definePluginSlot } from "metabase/plugins";
import type { Dispatch, GetState } from "metabase/redux/store";

import type { SlashCommand } from "./state/types";

export type MetabotSlashCommandHandler = (args: {
  command: SlashCommand;
  conversationId: string;
  dispatch: Dispatch;
  getState: GetState;
}) => boolean;

type MetabotSlashCommandsPlugin = {
  handleSlashCommand: MetabotSlashCommandHandler;
};

export const PLUGIN_METABOT_SLASH_COMMANDS = definePluginSlot(
  (): MetabotSlashCommandsPlugin => ({
    handleSlashCommand: () => false,
  }),
);
