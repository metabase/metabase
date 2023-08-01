import { DatasetColumn, TableColumnOrderSetting } from "metabase-types/api";
import * as Lib from "metabase-lib";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import { findColumnIndexForColumnSetting } from "metabase-lib/queries/utils/dataset";
import {
  ColumnGroupItem,
  ColumnMetadataItem,
  ColumnSettingItem,
  DragColumnProps,
  EditWidgetConfig,
} from "./types";

const STAGE_INDEX = -1;

export const getMetadataColumns = (query: Lib.Query): Lib.ColumnMetadata[] => {
  return Lib.visibleColumns(query, STAGE_INDEX);
};

export const getQueryColumnSettingItems = (
  query: Lib.Query,
  metadataColumns: Lib.ColumnMetadata[],
  datasetColumns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
): ColumnSettingItem[] => {
  const columnSettingItems: ColumnSettingItem[] = [];

  columnSettings.forEach((columnSetting, columnSettingIndex) => {
    if (!columnSetting.fieldRef) {
      return;
    }

    const metadataColumnIndex = Lib.findColumnIndexFromLegacyRef(
      query,
      STAGE_INDEX,
      metadataColumns,
      columnSetting.fieldRef,
    );
    if (metadataColumnIndex < 0) {
      return;
    }

    const datasetColumnIndex = Lib.findColumnIndexFromLegacyRef(
      query,
      STAGE_INDEX,
      datasetColumns,
      columnSetting.fieldRef,
    );
    if (datasetColumnIndex < 0) {
      return;
    }

    columnSettingItems.push({
      enabled: columnSetting.enabled,
      metadataColumn: metadataColumns[metadataColumnIndex],
      datasetColumn: datasetColumns[datasetColumnIndex],
      columnSettingIndex,
    });
  });

  return columnSettingItems;
};

export const getDatasetColumnSettingItems = (
  datasetColumns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
): ColumnSettingItem[] => {
  const columnSettingItems: ColumnSettingItem[] = [];

  columnSettings.forEach((columnSetting, columnSettingIndex) => {
    const datasetColumnIndex = findColumnIndexForColumnSetting(
      datasetColumns,
      columnSetting,
    );
    if (datasetColumnIndex < 0) {
      return;
    }

    columnSettingItems.push({
      enabled: columnSetting.enabled,
      datasetColumn: datasetColumns[datasetColumnIndex],
      columnSettingIndex,
    });
  });

  return columnSettingItems;
};

export const getAdditionalMetadataColumns = (
  metadataColumns: Lib.ColumnMetadata[],
  columnSettingItems: ColumnSettingItem[],
): Lib.ColumnMetadata[] => {
  const disabledMetadataColumns = new Set(metadataColumns);

  columnSettingItems.forEach(({ metadataColumn }) => {
    if (metadataColumn) {
      disabledMetadataColumns.delete(metadataColumn);
    }
  });

  return Array.from(disabledMetadataColumns);
};

export const getColumnGroups = (
  query: Lib.Query,
  metadataColumns: Lib.ColumnMetadata[],
): ColumnGroupItem[] => {
  const groups = Lib.groupColumns(metadataColumns);

  return groups.map(group => {
    const displayInfo = Lib.displayInfo(query, STAGE_INDEX, group);
    const columns = Lib.getColumnsFromColumnGroup(group);

    return {
      columns: columns.map(column => {
        const displayInfo = Lib.displayInfo(query, STAGE_INDEX, column);
        return {
          column,
          name: displayInfo.name,
          displayName: displayInfo.displayName,
        };
      }),
      displayName: displayInfo.displayName,
      isJoinable: displayInfo.isFromJoin || displayInfo.isImplicitlyJoinable,
    };
  });
};

export const getEditWidgetConfig = ({
  datasetColumn,
}: ColumnSettingItem): EditWidgetConfig | undefined => {
  return {
    id: "column_settings",
    props: { initialKey: getColumnKey(datasetColumn) },
  };
};

export const addColumnInQuery = (
  query: Lib.Query,
  { column }: ColumnMetadataItem,
) => {
  const displayInfo = Lib.displayInfo(query, STAGE_INDEX, column);
  return displayInfo.selected
    ? query
    : Lib.addField(query, STAGE_INDEX, column);
};

export const enableColumnInQuery = (
  query: Lib.Query,
  { metadataColumn }: ColumnSettingItem,
) => {
  if (!metadataColumn) {
    return query;
  }

  const displayInfo = Lib.displayInfo(query, STAGE_INDEX, metadataColumn);
  return displayInfo.selected
    ? query
    : Lib.addField(query, STAGE_INDEX, metadataColumn);
};

export const disableColumnInQuery = (
  query: Lib.Query,
  { metadataColumn }: ColumnSettingItem,
) => {
  if (!metadataColumn) {
    return query;
  }

  return Lib.removeField(query, STAGE_INDEX, metadataColumn);
};

const findColumnSettingIndex = (
  query: Lib.Query,
  column: Lib.ColumnMetadata,
  columnSettings: TableColumnOrderSetting[],
) => {
  const columns = [column];

  return columnSettings.findIndex(columnSetting => {
    if (!columnSetting.fieldRef) {
      return false;
    }

    const columnIndex = Lib.findColumnIndexFromLegacyRef(
      query,
      STAGE_INDEX,
      columns,
      columnSetting.fieldRef,
    );

    return columnIndex >= 0;
  });
};

export const addColumnInSettings = (
  query: Lib.Query,
  columnSettings: TableColumnOrderSetting[],
  { column, name }: ColumnMetadataItem,
): TableColumnOrderSetting[] => {
  const settingIndex = findColumnSettingIndex(query, column, columnSettings);

  const newSettings = [...columnSettings];
  if (settingIndex >= 0) {
    newSettings[settingIndex] = { ...newSettings[settingIndex], enabled: true };
  } else {
    const fieldRef = Lib.legacyFieldRef(column);
    newSettings.push({ name, fieldRef, enabled: true });
  }

  return newSettings;
};

export const enableColumnInSettings = (
  columnSettings: TableColumnOrderSetting[],
  { columnSettingIndex }: ColumnSettingItem,
) => {
  const newSettings = [...columnSettings];
  newSettings[columnSettingIndex] = {
    ...newSettings[columnSettingIndex],
    enabled: true,
  };

  return newSettings;
};

export const disableColumnInSettings = (
  columnSettings: TableColumnOrderSetting[],
  { columnSettingIndex }: ColumnSettingItem,
) => {
  const newSettings = [...columnSettings];
  newSettings[columnSettingIndex] = {
    ...newSettings[columnSettingIndex],
    enabled: false,
  };

  return newSettings;
};

export const moveColumnInSettings = (
  columnSettings: TableColumnOrderSetting[],
  enabledColumnItems: ColumnSettingItem[],
  { oldIndex, newIndex }: DragColumnProps,
) => {
  const adjustedOldIndex = enabledColumnItems[oldIndex].columnSettingIndex;
  const adjustedNewIndex = enabledColumnItems[newIndex].columnSettingIndex;

  const newSettings = [...columnSettings];
  newSettings.splice(
    adjustedNewIndex,
    0,
    newSettings.splice(adjustedOldIndex, 1)[0],
  );

  return newSettings;
};
