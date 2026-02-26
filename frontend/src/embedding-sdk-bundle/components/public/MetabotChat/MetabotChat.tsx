import type { ReactNode } from "react";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type {
  MetabotChatProps,
  MetabotCommandBarProps,
  MetabotFloatingActionButtonProps,
} from "./types";

type MetabotChatComponent = ((props: MetabotChatProps) => ReactNode) & {
  schema?: FunctionSchema;
};

type MetabotFloatingActionButtonComponent = ((
  props: MetabotFloatingActionButtonProps,
) => ReactNode) & {
  schema?: FunctionSchema;
};

type MetabotCommandBarComponent = ((
  props: MetabotCommandBarProps,
) => ReactNode) & {
  schema?: FunctionSchema;
};

export const METABOT_CHAT_SDK_EE_PLUGIN: {
  MetabotChat: MetabotChatComponent;
  FloatingActionButton: MetabotFloatingActionButtonComponent;
  CommandBar: MetabotCommandBarComponent;
} = {
  // Placeholder implementations – replaced by EE plugin at runtime
  MetabotChat: ((_props: MetabotChatProps) => null) as MetabotChatComponent,
  FloatingActionButton: ((_props: MetabotFloatingActionButtonProps) =>
    null) as MetabotFloatingActionButtonComponent,
  CommandBar: ((_props: MetabotCommandBarProps) =>
    null) as MetabotCommandBarComponent,
};

const MetabotChatBase = (props: MetabotChatProps) => {
  return <METABOT_CHAT_SDK_EE_PLUGIN.MetabotChat {...props} />;
};

const FloatingActionButton = (props: MetabotFloatingActionButtonProps) => {
  return <METABOT_CHAT_SDK_EE_PLUGIN.FloatingActionButton {...props} />;
};

const CommandBar = (props: MetabotCommandBarProps) => {
  return <METABOT_CHAT_SDK_EE_PLUGIN.CommandBar {...props} />;
};

export const MetabotChat = Object.assign(MetabotChatBase, {
  FloatingActionButton,
  CommandBar,
});
