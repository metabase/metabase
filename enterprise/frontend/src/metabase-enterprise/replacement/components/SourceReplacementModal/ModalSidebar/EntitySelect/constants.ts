import type { RecentContexts } from "metabase-types/api";
import type { EntityPickerProps } from "metabase/common/components/Pickers";

export const SOURCE_PICKER_MODELS: EntityPickerProps["models"] = [
  "table",
  "card",
  "dataset",
];

export const SOURCE_PICKER_OPTIONS = {
  hasDatabases: true,
  hasConfirmButtons: false,
  hasRecents: true,
};

export const RECENTS_CONTEXT: RecentContexts[] = ["selections"];
