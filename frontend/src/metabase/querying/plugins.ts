import type { ComponentType } from "react";

import { definePluginSlot } from "metabase/plugins";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type SqlGenerationPromptButtonProps = {
  size: number;
  isPromptInputOpen?: boolean;
  onClick?: () => void;
};

type SqlGenerationPlugin = {
  PromptButton: ComponentType<SqlGenerationPromptButtonProps>;
  FixQueryButton: ComponentType<Record<string, never>>;
  useHasAccess: () => boolean;
};

export const PLUGIN_SQL_GENERATION = definePluginSlot(
  (): SqlGenerationPlugin => ({
    PromptButton: PluginPlaceholder<SqlGenerationPromptButtonProps>,
    FixQueryButton: PluginPlaceholder<Record<string, never>>,
    useHasAccess: () => false,
  }),
);
