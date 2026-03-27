import type { OmniPickerItem } from "metabase/common/components/Pickers";

// can't link to schema
export type DocumentLinkedEntityPickerItemValue = OmniPickerItem & {
  model: Omit<OmniPickerItem["model"], "schema">;
};
