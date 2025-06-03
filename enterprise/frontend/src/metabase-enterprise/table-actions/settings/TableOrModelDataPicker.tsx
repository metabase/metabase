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
import type { RecentContexts, RecentItem } from "metabase-types/api";

import { ModelActionPicker, TableActionPicker } from "./ActionPicker";
import { isActionItem } from "./ActionPicker/utils";

type TableOrModelDataPickerProps = {
  value: ActionItem | undefined;
  onChange: (action: ActionItem | undefined) => void;
  onClose: () => void;
  children: ReactNode;
};

const RECENTS_CONTEXT: RecentContexts[] = ["selections"];

const SEARCH_PARAMS = {
  include_dashboard_questions: true,
};

const options: Partial<EntityPickerOptions> = {
  ...defaultOptions,
  hasConfirmButtons: false,
  hasRecents: true,
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

  const recentFilter = useCallback(
    (recentItems: RecentItem[]) => recentItems,
    [],
  );

  const handleItemSelect = useCallback(
    (item: TableActionPickerItem | ModelActionPickerItem) => {
      if (!isActionItem(item)) {
        onChange(undefined);
        return;
      }

      onChange(item);
    },
    [onChange],
  );

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
        folderModels: [
          "database" as const,
          "schema" as const,
          "table" as const,
        ],
        icon: "table",
        render: ({ onItemSelect }) => (
          <TableActionPicker
            path={tableActionPath}
            value={value as TableActionPickerValue | undefined}
            onItemSelect={onItemSelect}
            onPathChange={setTableActionPath}
          >
            {children}
          </TableActionPicker>
        ),
      },
    ];

    if (hasModels) {
      computedTabs.push({
        id: "models-tab",
        displayName: t`Models`,
        models: ["action" as const],
        folderModels: ["dataset" as const],
        icon: "model",
        render: ({ onItemSelect }) => (
          <ModelActionPicker
            path={modelActionPath}
            value={value as ModelActionPickerValue | undefined}
            onItemSelect={onItemSelect}
            onPathChange={setModelActionPath}
          >
            {children}
          </ModelActionPicker>
        ),
      });
    }

    return computedTabs;
  })();

  return (
    <EntityPickerContent
      canSelectItem
      defaultToRecentTab={false}
      initialValue={value}
      options={options}
      recentsContext={RECENTS_CONTEXT}
      recentFilter={recentFilter}
      searchParams={SEARCH_PARAMS}
      selectedItem={value ?? null}
      tabs={tabs}
      title={t`Pick action to add`}
      onClose={onClose}
      onItemSelect={handleItemSelect}
      isLoadingTabs={isLoadingAvailableData}
    />
  );
};
