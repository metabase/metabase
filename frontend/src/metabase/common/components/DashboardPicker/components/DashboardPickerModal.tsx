import { useCallback, useState } from "react";
import { t } from "ttag";

import type { CollectionPickerModel } from "../../CollectionPicker";
import type { EntityTab } from "../../EntityPicker";
import {
  EntityPickerModal,
  defaultOptions as defaultEntityPickerOptions,
} from "../../EntityPicker";
import type {
  DashboardPickerItem,
  DashboardPickerOptions,
  DashboardPickerModel,
  DashboardPickerValueItem,
} from "../types";

import {
  DashboardPicker,
  defaultOptions as defaultDashboardPickerOptions,
} from "./DashboardPicker";

interface DashboardPickerModalProps {
  title?: string;
  onChange: (item: DashboardPickerValueItem) => void;
  onClose: () => void;
  options?: DashboardPickerOptions;
  value?: Pick<DashboardPickerItem, "id" | "model">;
  models?: [DashboardPickerModel, ...DashboardPickerModel[]];
}

const canSelectItem = (
  item: DashboardPickerItem | null,
): item is DashboardPickerValueItem => {
  return (
    !!item &&
    item.can_write !== false &&
    item.model === "dashboard"
  );
};

const defaultOptions: DashboardPickerOptions = {
  ...defaultEntityPickerOptions,
  ...defaultDashboardPickerOptions,
};

export const DashboardPickerModal = ({
  title = t`Choose a dashboard`,
  onChange,
  onClose,
  value = { model: "collection", id: "root" },
  options = defaultOptions,
}: DashboardPickerModalProps) => {
  options = { ...defaultOptions, ...options };

  console.log("val", value);
  const [selectedItem, setSelectedItem] = useState<DashboardPickerItem | null>(
    null,
  );

  const handleItemSelect = useCallback(
    (item: DashboardPickerItem) => {
      if (options.hasConfirmButtons) {
        setSelectedItem(item);
      } else if (canSelectItem(item)) {
        onChange(item);
      }
    },
    [onChange, options],
  );

  const handleConfirm = () => {
    if (selectedItem && canSelectItem(selectedItem)) {
      onChange(selectedItem);
    }
  };

  const tabs: EntityTab<CollectionPickerModel>[] = [
    {
      displayName: t`Dashboards`,
      model: "dashboard",
      icon: "dashboard",
      element: (
        <DashboardPicker
          onItemSelect={handleItemSelect}
          initialValue={value}
          options={options}
          models={["dashboard"]}
        />
      ),
    },
  ];

  return (
    <EntityPickerModal
      title={title}
      onItemSelect={handleItemSelect}
      canSelectItem={canSelectItem(selectedItem)}
      onConfirm={handleConfirm}
      onClose={onClose}
      selectedItem={selectedItem}
      initialValue={value}
      tabs={tabs}
      options={options}
      searchResultFilter={results => results}
      actionButtons={[]}
    />
  );
};
