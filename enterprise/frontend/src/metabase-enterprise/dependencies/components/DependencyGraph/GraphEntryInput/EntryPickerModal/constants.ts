import type {
  EntityPickerOptions,
  EntityPickerProps,
} from "metabase/common/components/Pickers";
import type { RecentContexts } from "metabase-types/api";

export const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

export const ENTITY_PICKER_OPTIONS = {
  hasDatabases: true,
  hasConfirmButtons: false,
  hasRecents: true,
};

export const QUESTION_PICKER_OPTIONS: EntityPickerOptions = {
  hasRootCollection: true,
  hasPersonalCollections: true,
};

export const DASHBOARD_PICKER_OPTIONS: EntityPickerOptions = {
  hasRootCollection: true,
  hasPersonalCollections: true,
};

export const ENTRY_PICKER_MODELS: EntityPickerProps["models"] = [
  "table",
  "card",
  "dataset",
  "metric",
  "dashboard",
  "transform",
];
