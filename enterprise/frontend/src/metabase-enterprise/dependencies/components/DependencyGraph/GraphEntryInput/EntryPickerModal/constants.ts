import {
  type EntityPickerModalOptions,
  defaultOptions,
} from "metabase/common/components/EntityPicker";
import type { DashboardPickerOptions } from "metabase/common/components/Pickers/DashboardPicker";
import type { QuestionPickerOptions } from "metabase/common/components/Pickers/QuestionPicker";
import type { RecentContexts } from "metabase-types/api";

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
