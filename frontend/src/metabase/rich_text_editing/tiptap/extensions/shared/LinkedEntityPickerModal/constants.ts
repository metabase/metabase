import {
  type EntityPickerModalOptions,
  defaultOptions,
} from "metabase/common/components/EntityPicker";
import type { CollectionPickerOptions } from "metabase/common/components/Pickers/CollectionPicker";
import type { DashboardPickerOptions } from "metabase/common/components/Pickers/DashboardPicker";
import type { QuestionPickerOptions } from "metabase/common/components/Pickers/QuestionPicker";
import type { RecentContexts } from "metabase-types/api";

export const DOCUMENT_LINK_MODELS = [
  "card",
  "dataset",
  "metric",
  "dashboard",
  "collection",
  "document",
  "table",
  "database",
  "transform",
] as const;
export type DocumentLinkItemModel = (typeof DOCUMENT_LINK_MODELS)[number];

export const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

export const ENTITY_PICKER_OPTIONS: EntityPickerModalOptions = {
  ...defaultOptions,
  hasConfirmButtons: false,
  hasRecents: true,
};

export const QUESTION_PICKER_OPTIONS: QuestionPickerOptions = {
  showRootCollection: true,
  showPersonalCollections: true,
};

export const DASHBOARD_PICKER_OPTIONS: DashboardPickerOptions = {
  showRootCollection: true,
  showPersonalCollections: true,
};

export const COLLECTION_PICKER_OPTIONS: CollectionPickerOptions = {
  showRootCollection: false,
  showPersonalCollections: true,
  showLibrary: false,
};
