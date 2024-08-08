import { useCallback, useState, useRef } from "react";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";
import type { RecentItem, SearchResult } from "metabase-types/api";

import type { CollectionPickerModel } from "../../CollectionPicker";
import type { EntityTab } from "../../EntityPicker";
import {
  EntityPickerModal,
  defaultOptions as defaultEntityPickerOptions,
} from "../../EntityPicker";
import type {
  DashboardPickerItem,
  DashboardPickerOptions,
  DashboardPickerValueItem,
  DashboardPickerInitialValueItem,
} from "../types";
import { getCollectionId } from "../utils";

import {
  DashboardPicker,
  defaultOptions as defaultDashboardPickerOptions,
} from "./DashboardPicker";
import { NewDashboardDialog } from "./NewDashboardDialog";

interface DashboardPickerModalProps {
  title?: string;
  onChange: (item: DashboardPickerValueItem) => void;
  onClose: () => void;
  options?: DashboardPickerOptions;
  value?: DashboardPickerInitialValueItem;
  searchFilter?: (searchResults: SearchResult[]) => SearchResult[];
  recentFilter?: (recents: RecentItem[]) => RecentItem[];
  shouldDisableItem?: (
    item: DashboardPickerItem,
    isReadOnlyCollection?: boolean,
  ) => boolean;
}

const canSelectItem = (
  item: DashboardPickerItem | DashboardPickerInitialValueItem | null,
): item is DashboardPickerValueItem => {
  return item?.model === "dashboard";
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
  shouldDisableItem,
  searchFilter,
  recentFilter,
}: DashboardPickerModalProps) => {
  options = { ...defaultOptions, ...options };

  const [selectedItem, setSelectedItem] = useState<DashboardPickerItem | null>(
    canSelectItem(value) ? value : null,
  );

  const [
    isCreateDialogOpen,
    { turnOn: openCreateDialog, turnOff: closeCreateDialog },
  ] = useToggle(false);

  const pickerRef = useRef<{
    onNewDashboard: (item: DashboardPickerItem) => void;
  }>();

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

  const modalActions = [
    <Button
      key="dashboard-on-the-go"
      miw="21rem"
      onClick={openCreateDialog}
      leftIcon={<Icon name="add" />}
      disabled={selectedItem?.can_write === false}
    >
      {t`Create a new dashboard`}
    </Button>,
  ];

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
          ref={pickerRef}
          shouldDisableItem={shouldDisableItem}
        />
      ),
    },
  ];

  const handleNewDashboardCreate = (newDashboard: DashboardPickerItem) => {
    pickerRef.current?.onNewDashboard(newDashboard);
  };

  const parentCollectionId = getCollectionId(selectedItem || value);

  return (
    <>
      <EntityPickerModal
        title={title}
        onItemSelect={handleItemSelect}
        canSelectItem={!isCreateDialogOpen && canSelectItem(selectedItem)}
        onConfirm={handleConfirm}
        onClose={onClose}
        selectedItem={selectedItem}
        initialValue={value}
        tabs={tabs}
        options={options}
        searchResultFilter={searchFilter}
        recentFilter={recentFilter}
        actionButtons={modalActions}
        searchParams={
          options.showRootCollection === false
            ? { filter_items_in_personal_collection: "only" }
            : options.showPersonalCollections === false
            ? { filter_items_in_personal_collection: "exclude" }
            : undefined
        }
        trapFocus={!isCreateDialogOpen}
      />
      <NewDashboardDialog
        isOpen={isCreateDialogOpen}
        onClose={closeCreateDialog}
        parentCollectionId={parentCollectionId}
        onNewDashboard={handleNewDashboardCreate}
      />
    </>
  );
};
