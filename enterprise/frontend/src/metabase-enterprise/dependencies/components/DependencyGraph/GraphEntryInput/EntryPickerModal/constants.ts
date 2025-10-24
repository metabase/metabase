import {
  type EntityPickerModalOptions,
  defaultOptions,
} from "metabase/common/components/EntityPicker";
import type {
  QuestionPickerModel,
  QuestionPickerOptions,
} from "metabase/common/components/Pickers/QuestionPicker";
import type {
  CollectionItemModel,
  RecentContexts,
  SearchModel,
} from "metabase-types/api";

import type { EntryPickerItemModel } from "./types";

export const TABLE_MODELS: EntryPickerItemModel[] = ["table"];

export const TABLE_FOLDER_MODELS: EntryPickerItemModel[] = [
  "database",
  "schema",
];

export const TRANSFORM_MODELS: (EntryPickerItemModel & SearchModel)[] = [
  "transform",
];

export const TRANSFORM_FOLDER_MODELS: EntryPickerItemModel[] = [];

export const QUESTION_MODELS: (EntryPickerItemModel & QuestionPickerModel)[] = [
  "card",
  "dataset",
  "metric",
];

export const QUESTION_MODELS_WITH_DASHBOARDS: CollectionItemModel[] = [
  "card",
  "dataset",
  "metric",
  "dashboard",
];

export const QUESTION_FOLDER_MODELS: EntryPickerItemModel[] = [
  "collection",
  "dashboard",
];

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
