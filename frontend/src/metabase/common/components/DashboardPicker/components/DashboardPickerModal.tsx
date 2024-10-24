import { useCallback, useRef, useState } from "react";
import { t } from "ttag";

import { useToggle } from "metabase/hooks/use-toggle";
import { Button, Icon } from "metabase/ui";
import type { RecentItem, SearchResult } from "metabase-types/api";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

import type { EntityPickerTab } from "../../EntityPicker";
import {
  EntityPickerModal,
  defaultOptions as defaultEntityPickerOptions,
} from "../../EntityPicker";
import { EntityPicker } from "../../EntityPicker/components/EntityPicker";
import { useLogRecentItem } from "../../EntityPicker/hooks/use-log-recent-item";
import type {
  DashboardPickerInitialValueItem,
  DashboardPickerItem,
  DashboardPickerOptions,
  DashboardPickerStatePath,
  DashboardPickerValueItem,
} from "../types";
import { getCollectionId } from "../utils";
import { getPathLevelForItem } from "../../CollectionPicker/utils";

import {
  // DashboardPicker,
  defaultOptions as defaultDashboardPickerOptions,
} from "./DashboardPicker";
import { NewDashboardDialog } from "./NewDashboardDialog";
import { InitialValue } from "metabase/components/TextWidget/TextWidget.stories";

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
  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const [selectedItem, setSelectedItem] = useState<DashboardPickerItem | null>(
    canSelectItem(value) ? value : null,
  );

  const [dashboardsPath, setDashboardsPath] =
    useState<DashboardPickerStatePath>();

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
      } else if (canSelectItem(item)) {
        handleOnChange(item);
      }
    },
    [handleOnChange, options],
  );

  const handleConfirm = () => {
    if (selectedItem && canSelectItem(selectedItem)) {
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
      displayName: t`Dashboards`,
      model: "dashboard" as const,
      folderModels: ["collection" as const],
      icon: "dashboard",
      render: ({ onItemSelect }) => (
        <EntityPicker
          initialValue={value}
          models={["dashboard"]}
          options={options}
          path={dashboardsPath}
          ref={pickerRef}
          shouldDisableItem={shouldDisableItem}
          onItemSelect={onItemSelect}
          onPathChange={setDashboardsPath}
        />
      ),
    },
  ];

  const handleNewDashboardCreate = (newDashboard: DashboardPickerItem) => {
    const collection_id = newDashboard.collection_id || "root";
    const selectedItem = { ...newDashboard, model: "dashboard", collection_id };

    // Is the parent collection already in the path? Possible if collection in the picker is "empty",
    // and therefore not a folder
    const isParentCollectionInPath =
      getPathLevelForItem(
        selectedItem,
        dashboardsPath,
        userPersonalCollectionId,
      ) > 0;

    if (!isParentCollectionInPath) {
      setDashboardsPath(path => [
        ...path,
        {
          query: {
            id: parentCollectionId,
            models: ["dashboard", "collection"],
          },
          selectedItem,
        },
      ]);
      setSelectedItem(selectedItem);
    } else {
      pickerRef.current?.onNewItem(selectedItem);
    }
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
