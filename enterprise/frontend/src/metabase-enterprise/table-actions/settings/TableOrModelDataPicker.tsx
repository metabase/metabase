import { type ReactNode, useCallback, useState } from "react";
import { t } from "ttag";

import type {
  ActionItem,
  ModelActionPickerItem,
  ModelActionPickerStatePath,
  ModelActionPickerValue,
  TableActionPickerItem,
  TableActionPickerStatePath,
  TableActionPickerValue,
} from "metabase/common/components/DataPicker";
import { useAvailableData } from "metabase/common/components/DataPicker/hooks";
import {
  EntityPickerContent,
  type EntityPickerOptions,
  type EntityPickerTab,
  defaultOptions,
} from "metabase/common/components/EntityPicker";

import { ModelActionPicker, TableActionPicker } from "./ActionPicker";
import { isActionItem } from "./ActionPicker/utils";

type TableOrModelDataPickerProps = {
  value: ActionItem | undefined;
  onChange: (action: ActionItem | undefined) => void;
  onClose: () => void;
  children: ReactNode;
};

const options: Partial<EntityPickerOptions> = {
  ...defaultOptions,
  hasConfirmButtons: false,
  hasRecents: false,
};

export const TableOrModelDataPicker = ({
  value,
  onChange,
  onClose,
  children,
}: TableOrModelDataPickerProps) => {
  const { hasModels, isLoading: isLoadingAvailableData } = useAvailableData({
    databaseId: undefined,
    models: ["dataset"],
  });

  const [tableActionPath, setTableActionPath] =
    useState<TableActionPickerStatePath>();
  const [modelActionPath, setModelActionPath] =
    useState<ModelActionPickerStatePath>();

  const tabs = (function getTabs() {
    const computedTabs: EntityPickerTab<
      TableActionPickerItem["id"] | ModelActionPickerItem["id"],
      TableActionPickerItem["model"] | ModelActionPickerItem["model"],
      TableActionPickerItem | ModelActionPickerItem
    >[] = [
      {
        id: "tables-tab",
        displayName: t`Tables`,
        models: ["action" as const],
        folderModels: [],
        icon: "table",
        render: ({ onItemSelect }) => {
          return (
            <TableActionPicker
              path={tableActionPath}
              value={value as TableActionPickerValue | undefined}
              onItemSelect={onItemSelect}
              onPathChange={setTableActionPath}
            >
              {children}
            </TableActionPicker>
          );
        },
      },
    ];

    if (hasModels) {
      computedTabs.push({
        id: "models-tab",
        displayName: t`Models`,
        models: ["action" as const],
        folderModels: [],
        icon: "model",
        render: ({ onItemSelect }) => {
          return (
            <ModelActionPicker
              path={modelActionPath}
              value={value as ModelActionPickerValue | undefined}
              onItemSelect={onItemSelect}
              onPathChange={setModelActionPath}
            >
              {children}
            </ModelActionPicker>
          );
        },
      });
    }

    return computedTabs;
  })();

  const handleItemSelect = useCallback(
    (item: TableActionPickerItem | ModelActionPickerItem) => {
      if (isActionItem(item)) {
        onChange(item);
        return;
      }

      // TODO: we can add tables and models to search results and react here on such item select,
      //  but, there is no way to switch to needed tab from here.

      onChange(undefined);
    },
    [onChange],
  );

  const handleTabChange = useCallback(() => {
    onChange(undefined);
    setTableActionPath(undefined);
    setModelActionPath(undefined);
  }, [onChange]);

  return (
    <EntityPickerContent
      canSelectItem
      defaultToRecentTab={false}
      initialValue={value}
      options={options}
      selectedItem={value ?? null}
      tabs={tabs}
      title={t`Pick an action to add`}
      onClose={onClose}
      onItemSelect={handleItemSelect}
      isLoadingTabs={isLoadingAvailableData}
      onTabChange={handleTabChange}
    />
  );
};
