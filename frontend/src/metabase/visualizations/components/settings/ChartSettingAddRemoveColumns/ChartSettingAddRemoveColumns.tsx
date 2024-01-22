import { useCallback, useState, useMemo } from "react";
import { t } from "ttag";
import { Checkbox, TextInput, Box, Flex, Text, Icon } from "metabase/ui";

import type { TableColumnOrderSetting } from "metabase-types/api";
import { getColumnIcon } from "metabase/common/utils/columns";

import type * as Lib from "metabase-lib";
import type {
  ColumnSetting,
  ColumnMetadataItem,
} from "../ChartSettingTableColumns/types";
import {
  getColumnGroups,
  getMetadataColumns,
  enableColumnInQuery,
  disableColumnInQuery,
  findColumnSettingIndex,
  removeColumnFromSettings,
  addColumnInSettings,
  getColumnSettingsWithRefs,
} from "../ChartSettingTableColumns/utils";

interface ChartSettingAddRemoveColumnsProps {
  query: Lib.Query;
  value: TableColumnOrderSetting[];
  onChange: (value: ColumnSetting[], quesion?: Lib.Query) => void;
}

export const ChartSettingAddRemoveColumns = ({
  value,
  onChange,
  query,
}: ChartSettingAddRemoveColumnsProps) => {
  const [search, setSearch] = useState("");

  const columnSettings = useMemo(
    () => getColumnSettingsWithRefs(value),
    [value],
  );

  const metadataColumnGroups = useMemo(() => {
    const groups = getColumnGroups(query, getMetadataColumns(query));

    return groups.map((group, index, arr) => {
      const name = group.displayName;
      const repeats = arr
        .slice(0, index)
        .filter(x => x.displayName === name).length;

      return {
        ...group,
        displayName: repeats > 0 ? `${name} ${repeats + 1}` : `${name}`,
      };
    });
  }, [query]);

  const columnInQuery = (columnItem: ColumnMetadataItem) =>
    findColumnSettingIndex(query, columnItem.column, columnSettings) !== -1;

  const areAllColumnsInQuery = (columns: ColumnMetadataItem[]) => {
    return columns.every(columnInQuery);
  };

  const addAllColumnsFromTable = (columns: ColumnMetadataItem[]) => {
    let newQuery = query;
    let newSettings = columnSettings;
    columns.forEach(columnItem => {
      if (!columnInQuery(columnItem)) {
        newSettings = addColumnInSettings(newQuery, newSettings, columnItem);
        newQuery = enableColumnInQuery(newQuery, {
          metadataColumn: columnItem.column,
        });
      }
    });

    onChange(newSettings, newQuery);
  };

  const removeAllColumnsFromTable = (columns: ColumnMetadataItem[]) => {
    let newQuery = query;
    let newSettings = columnSettings;

    columns.forEach(columnItem => {
      if (columnInQuery(columnItem)) {
        const columnSettingIndex = findColumnSettingIndex(
          newQuery,
          columnItem.column,
          newSettings,
        );
        newSettings = removeColumnFromSettings(newSettings, {
          columnSettingIndex,
        });

        newQuery = disableColumnInQuery(newQuery, {
          metadataColumn: columnItem.column,
        });
      }
    });

    onChange(newSettings, newQuery);
  };

  const toggleColumn = (columnItem: ColumnMetadataItem) => {
    if (columnInQuery(columnItem)) {
      handleDisableColumn(columnItem);
    } else {
      handleEnableColumn(columnItem);
    }
  };

  const handleEnableColumn = useCallback(
    (columnItem: ColumnMetadataItem) => {
      const newSettings = addColumnInSettings(
        query,
        columnSettings,
        columnItem,
      );
      const newQuery = enableColumnInQuery(query, {
        metadataColumn: columnItem.column,
      });
      onChange(newSettings, newQuery);
    },
    [query, columnSettings, onChange],
  );

  const handleDisableColumn = useCallback(
    (columnItem: ColumnMetadataItem) => {
      const columnSettingIndex = findColumnSettingIndex(
        query,
        columnItem.column,
        columnSettings,
      );
      const newSettings = removeColumnFromSettings(columnSettings, {
        columnSettingIndex,
      });

      const newQuery = disableColumnInQuery(query, {
        metadataColumn: columnItem.column,
      });

      onChange(newSettings, newQuery);
    },
    [query, columnSettings, onChange],
  );

  const showAddRemoveAll = (columns: ColumnMetadataItem[]) => {
    return (
      !columns.some(
        columnItem => columnItem.isAggregation || columnItem.isBreakout,
      ) && !search
    );
  };

  return (
    <div>
      <TextInput
        value={search}
        onChange={e => setSearch(e.target.value)}
        rightSection={<Icon name="search" />}
        placeholder={t`Search for a column...`}
        mb="1rem"
      />
      {metadataColumnGroups.map(columnGroup => {
        const filteredColumns = columnGroup.columns.filter(
          columnItem =>
            !search ||
            columnItem.displayName
              .toLowerCase()
              .includes(search.toLocaleLowerCase()),
        );

        if (filteredColumns.length === 0) {
          return null;
        }

        return (
          <div
            role="list"
            aria-label={`${columnGroup.displayName.toLocaleLowerCase()}-table-columns`}
            key={`column-group-${columnGroup.displayName}`}
          >
            <Text fz="lg" fw={700} lh="1.5rem" mb="1rem" mt="1.75rem">
              {columnGroup.displayName}
            </Text>
            {showAddRemoveAll(columnGroup.columns) && (
              <Box mb="1.5rem">
                {areAllColumnsInQuery(columnGroup.columns) ? (
                  <Checkbox
                    variant="stacked"
                    size="xs"
                    label={
                      <Text
                        fw={700}
                        ml="0.375rem"
                        lh="1rem"
                      >{t`Remove all`}</Text>
                    }
                    checked={true}
                    onClick={() =>
                      removeAllColumnsFromTable(columnGroup.columns)
                    }
                  />
                ) : (
                  <Checkbox
                    variant="stacked"
                    size="xs"
                    label={
                      <Text fw={700} ml="0.375rem" lh="1rem">{t`Add all`}</Text>
                    }
                    checked={false}
                    onClick={() => addAllColumnsFromTable(columnGroup.columns)}
                  />
                )}
              </Box>
            )}
            {filteredColumns.map(columnItem => (
              <Box mb="1rem" key={`column-${columnItem.displayName}`}>
                <Checkbox
                  label={
                    <Flex ml="0.25rem" align="center">
                      <Icon name={getColumnIcon(columnItem.column)}></Icon>
                      <Text span ml="0.5rem" lh="1rem" fw={400}>
                        {columnItem.displayName}
                      </Text>
                    </Flex>
                  }
                  checked={columnInQuery(columnItem)}
                  onClick={() => toggleColumn(columnItem)}
                  disabled={columnItem.isBreakout || columnItem.isAggregation}
                  mb="1.5rem"
                  size="xs"
                />
              </Box>
            ))}
          </div>
        );
      })}
    </div>
  );
};
