import { useCallback, useRef, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";
import type { RecentItem, SearchResult } from "metabase-types/api";

import type { EntityPickerTab } from "../../EntityPicker";
import {
  EntityPickerModal,
  defaultOptions as defaultEntityPickerOptions,
} from "../../EntityPicker";
import { useLogRecentItem } from "../../EntityPicker/hooks/use-log-recent-item";
import type {
  DashboardPickerInitialValueItem,
  DashboardPickerItem,
  DashboardPickerOptions,
  DashboardPickerStatePath,
  DashboardPickerValueItem,
} from "../types";
import { getCollectionId } from "../utils";

import {
  DashboardPicker,
  defaultOptions as defaultDashboardPickerOptions,
} from "./DashboardPicker";
import { NewDashboardDialog } from "./NewDashboardDialog";

export interface DashboardPickerModalProps {
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
  canSelectCollection?: boolean;
}

const canSelectItem = (
  item: DashboardPickerItem | DashboardPickerInitialValueItem | null,
  canSelectCollection: boolean,
): item is DashboardPickerValueItem => {
  return (
    item?.model === "dashboard" ||
    (canSelectCollection && item?.model === "collection")
  );
};

const defaultOptions: DashboardPickerOptions = {
  ...defaultEntityPickerOptions,
  ...defaultDashboardPickerOptions,
};

const mergeOptions = (
  options: Partial<DashboardPickerOptions>,
  canSelectCollection: boolean,
  selectedModel: DashboardPickerItem["model"] | null | undefined,
) => ({
  ...defaultOptions,
  ...(canSelectCollection
    ? {
        confirmButtonText: match(selectedModel)
          .with("dashboard", () => t`Save in this dashboard`)
          .with("collection", () => t`Save in this collection`)
          .otherwise(() => t`Save`),
      }
    : {}),
  ...options,
});

export const DashboardPickerModal = ({
  title = t`Choose a dashboard`,
  onChange,
  onClose,
  value = { model: "collection", id: "root" },
  options = defaultOptions,
  shouldDisableItem,
  searchFilter,
  recentFilter,
  canSelectCollection = false,
}: DashboardPickerModalProps) => {
  const [selectedItem, setSelectedItem] = useState<DashboardPickerItem | null>(
    canSelectItem(value, canSelectCollection) ? value : null,
  );

  options = mergeOptions(options, canSelectCollection, selectedItem?.model);

  const [dashboardsPath, setDashboardsPath] =
    useState<DashboardPickerStatePath>();

  const handleDashboardsPathChange = useCallback(
    function (newPath: DashboardPickerStatePath) {
      setDashboardsPath(newPath);
      const last = newPath?.[newPath.length - 1];
      if (
        last &&
        canSelectItem(last?.selectedItem ?? null, canSelectCollection)
      ) {
        setSelectedItem(last.selectedItem);
      }
    },
    [canSelectCollection],
  );

  const { tryLogRecentItem } = useLogRecentItem();

  const handleOnChange = useCallback(
    (item: DashboardPickerValueItem) => {
      onChange(item);
      tryLogRecentItem(item);
    },
    [onChange, tryLogRecentItem],
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
      } else if (canSelectItem(item, canSelectCollection)) {
        handleOnChange(item);
      }
    },
    [handleOnChange, options, canSelectCollection],
  );

  const handleConfirm = () => {
    if (selectedItem && canSelectItem(selectedItem, canSelectCollection)) {
      handleOnChange(selectedItem);
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

  const tabs: EntityPickerTab<
    DashboardPickerItem["id"],
    DashboardPickerItem["model"],
    DashboardPickerItem
  >[] = [
    {
      id: "dashboards-tab",
      displayName: canSelectCollection ? t`Browse` : t`Dashboards`,
      models: ["dashboard" as const],
      additionalModels: canSelectCollection ? ["collection"] : undefined,
      folderModels: ["collection" as const],
      icon: "dashboard",
      render: ({ onItemSelect }) => (
        <DashboardPicker
          initialValue={value}
          models={["dashboard", "collection"]}
          options={options}
          path={dashboardsPath}
          ref={pickerRef}
          shouldDisableItem={shouldDisableItem}
          onItemSelect={onItemSelect}
          onPathChange={handleDashboardsPathChange}
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
        canSelectItem={
          !isCreateDialogOpen &&
          canSelectItem(selectedItem, canSelectCollection)
        }
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
