import type { CardId } from "metabase-types/api";

import type { OmniPickerItem } from "../EntityPicker";

export type QuestionPickerValueModel = Extract<
  OmniPickerItem["model"],
  "card" | "dataset" | "metric"
>;

export type QuestionPickerValueItem = Pick<OmniPickerItem, "id" | "model"> & {
  id: CardId;
  model: QuestionPickerValueModel;
};
