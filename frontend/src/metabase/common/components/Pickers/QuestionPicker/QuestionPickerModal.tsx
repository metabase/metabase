import { useCallback } from "react";
import { t } from "ttag";

import {
  EntityPickerModal,
  type EntityPickerModalProps,
  type OmniPickerItem,
  type OmniPickerQuestionItem,
} from "../EntityPicker";

const canSelectItem = (
  item: OmniPickerItem | null,
): item is OmniPickerQuestionItem => {
  return !!(
    item != null &&
    item.id &&
    (item.model === "card" ||
      item.model === "dataset" ||
      item.model === "metric")
  );
};

export type QuestionPickerModalProps = Omit<
  EntityPickerModalProps,
  "models" | "onChange"
> & {
  // you can pass dashboard as a model to allow picking questions within dashboards
  // but dashboards will never be a finally pickable item
  models?: (OmniPickerQuestionItem["model"] | "dashboard")[];
  onChange: (item: OmniPickerQuestionItem) => void;
};

export const QuestionPickerModal = ({
  title = t`Choose a question or model`,
  onChange,
  value = { model: "collection", id: "root" },
  options = {},
  models = ["card", "dataset"],
  ...props
}: QuestionPickerModalProps) => {
  const handleChange = useCallback(
    (item: OmniPickerItem) => {
      if (canSelectItem(item)) {
        onChange(item);
      }
    },
    [onChange],
  );

  const isSelectableItem = (item: OmniPickerItem) => {
    return canSelectItem(item);
  };

  return (
    <EntityPickerModal
      title={title}
      onChange={handleChange}
      value={value}
      models={models}
      options={options}
      searchParams={
        options.hasRootCollection === false
          ? { filter_items_in_personal_collection: "only" }
          : options.hasPersonalCollections === false
            ? { filter_items_in_personal_collection: "exclude" }
            : undefined
      }
      isSelectableItem={isSelectableItem}
      {...props}
    />
  );
};
