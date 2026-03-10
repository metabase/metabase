import type {
  EntityPickerModalProps,
  EntityPickerOptions,
} from "metabase/common/components/Pickers";
import type { RecentContexts } from "metabase-types/api";

export const DOCUMENT_LINK_MODELS: EntityPickerModalProps["models"] = [
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "document",
  "table",
  "database",
  "transform",
];

export const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

export const ENTITY_PICKER_OPTIONS: EntityPickerOptions = {
  hasSearch: true,
  hasRecents: true,
  hasLibrary: true,
  hasDatabases: true,
  hasRootCollection: true,
  hasPersonalCollections: true,

  hasConfirmButtons: true,
};
