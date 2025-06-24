import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { cardApi, tableApi } from "metabase/api";
import type { ActionItem } from "metabase/common/components/DataPicker";
import { useAvailableData } from "metabase/common/components/DataPicker/hooks";
import {
  DelayedLoadingSpinner,
  EntityPickerContent,
  type EntityPickerOptions,
  type EntityPickerTab,
  defaultOptions,
} from "metabase/common/components/EntityPicker";
import { useDispatch } from "metabase/lib/redux";
import { Center } from "metabase/ui";
import type { CardId, DatabaseId, TableId } from "metabase-types/api";

import { ModelActionPicker } from "./ModelActionPicker";
import { TableActionPicker } from "./TableActionPicker";
import type {
  ModelActionPickerItem,
  ModelActionPickerStatePath,
  TableActionPickerItem,
  TableActionPickerStatePath,
} from "./types";
import { isActionItem } from "./utils";

type TableOrModelDataPickerProps = {
  value: TableActionPickerItem | ModelActionPickerItem | undefined;
  initialDbId: DatabaseId | undefined;
  onChange: (action: ActionItem | undefined) => void;
  onClose: () => void;
};

const options: Partial<EntityPickerOptions> = {
  ...defaultOptions,
  hasConfirmButtons: false,
  hasRecents: false,
};

export const TableOrModelActionPicker = ({
  value,
  initialDbId,
  onChange,
  onClose,
}: TableOrModelDataPickerProps) => {
  const { hasModels, isLoading: isLoadingAvailableData } = useAvailableData({
    databaseId: undefined,
    models: ["dataset"],
  });

  const [tableActionPath, setTableActionPath] =
    useState<TableActionPickerStatePath>();
  const [modelActionPath, setModelActionPath] =
    useState<ModelActionPickerStatePath>();

  const dispatch = useDispatch();

  const shouldHaveTableInitialPath = value?.model === "table";
  const shouldHaveModelInitialPath = value?.model === "dataset";

  const [isSetupComplete, setIsSetupComplete] = useState(() => {
    if (!value && !initialDbId) {
      return true;
    }

    if (shouldHaveTableInitialPath && tableActionPath) {
      return true;
    }

    if (shouldHaveModelInitialPath && modelActionPath) {
      return true;
    }

    return false;
  });

  const tabs = (function getTabs() {
    const computedTabs: EntityPickerTab<
      TableActionPickerItem["id"] | ModelActionPickerItem["id"],
      TableActionPickerItem["model"] | ModelActionPickerItem["model"],
      TableActionPickerItem | ModelActionPickerItem
    >[] = [
      {
        id: "tables-tab",
        displayName: t`Tables`,
        models: ["table" as const, "action" as const],
        folderModels: [],
        icon: "table",
        render: ({ onItemSelect }) => {
          if (shouldHaveTableInitialPath && !isSetupComplete) {
            return (
              <Center h="100%">
                <DelayedLoadingSpinner />
              </Center>
            );
          }

          return (
            <TableActionPicker
              path={tableActionPath}
              onItemSelect={onItemSelect}
              onPathChange={(path) => {
                setTableActionPath(path);
              }}
            />
          );
        },
      },
    ];

    if (hasModels) {
      computedTabs.push({
        id: "models-tab",
        displayName: t`Models`,
        models: ["dataset" as const, "action" as const],
        folderModels: [],
        icon: "model",
        render: ({ onItemSelect }) => {
          if (shouldHaveModelInitialPath && !isSetupComplete) {
            return (
              <Center h="100%">
                <DelayedLoadingSpinner />
              </Center>
            );
          }

          return (
            <ModelActionPicker
              path={modelActionPath}
              onItemSelect={onItemSelect}
              onPathChange={setModelActionPath}
            />
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
    },
    [onChange],
  );

  useMount(() => {
    async function fetchTableMetadata(tableId: TableId) {
      const action = dispatch(
        tableApi.endpoints.getTable.initiate({ id: tableId }),
      );

      try {
        const tableData = await action.unwrap();

        const { db_id, schema, id } = tableData;
        setTableActionPath([db_id, schema, id, undefined]);
      } catch (e) {
        setTableActionPath([undefined, undefined, undefined, undefined]);
      } finally {
        setIsSetupComplete(true);
      }
    }

    if (value?.model === "table" && !tableActionPath) {
      fetchTableMetadata(value.id);
    } else {
      if (!value && !tableActionPath && initialDbId) {
        // preselect db
        setTableActionPath([initialDbId, undefined, undefined, undefined]);
        setIsSetupComplete(true);
      }
    }
  });

  useMount(() => {
    async function fetchModelMetadata(modelId: CardId) {
      const action = dispatch(
        cardApi.endpoints.getCard.initiate({ id: modelId }),
      );

      try {
        const modelData = await action.unwrap();

        const { collection_id, id } = modelData;
        setModelActionPath([collection_id || "root", id, undefined]);
      } catch (e) {
        setModelActionPath([undefined, undefined, undefined]);
      } finally {
        setIsSetupComplete(true);
      }
    }

    if (value?.model === "dataset" && !modelActionPath) {
      fetchModelMetadata(value.id);
    }
  });

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
      isLoadingTabs={isLoadingAvailableData && !isSetupComplete}
    />
  );
};
