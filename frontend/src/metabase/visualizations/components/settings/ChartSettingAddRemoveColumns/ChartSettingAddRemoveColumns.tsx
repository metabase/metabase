import { useCallback, useState, useMemo } from "react";
import { t } from "ttag";
import { Button, Checkbox, TextInput, Box, Flex, Text } from "metabase/ui";

import { Icon } from "metabase/core/components/Icon";
import type { TableColumnOrderSetting } from "metabase-types/api";
import { getColumnIcon } from "metabase/common/utils/columns";
import { StackedCheckBox } from "metabase/components/StackedCheckBox/StackedCheckBox";

import type Question from "metabase-lib/Question";
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
  question: Question;
  value: TableColumnOrderSetting[];
  onChange: (value: ColumnSetting[], quesion?: Question) => void;
  onWidgetOverride: (key: string | null) => void;
}

export const ChartSettingAddRemoveColumns = ({
  value,
  onChange,
  question,
  onWidgetOverride,
}: ChartSettingAddRemoveColumnsProps) => {
  const [search, setSearch] = useState("");
  const query = question._getMLv2Query();

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

  const areAllColumnsInQuery = (columns: ColumnMetadataItem[]) => {
    return columns.every(({ selected }) => selected);
  };

  const addAllColumnsFromTable = (columns: ColumnMetadataItem[]) => {
    let newQuery = query;
    let newSettings = columnSettings;
    columns.forEach(columnItem => {
      if (!columnItem.selected) {
        newSettings = addColumnInSettings(newQuery, newSettings, columnItem);
        newQuery = enableColumnInQuery(newQuery, {
          metadataColumn: columnItem.column,
        });
      }
    });

    onChange(newSettings, question?._setMLv2Query(newQuery));
  };

  const removeAllColumnsFromTable = (columns: ColumnMetadataItem[]) => {
    let newQuery = query;
    let newSettings = columnSettings;

    columns.forEach(columnItem => {
      if (columnItem.selected) {
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

    onChange(newSettings, question?._setMLv2Query(newQuery));
  };

  const toggleColumn = (columnItem: ColumnMetadataItem) => {
    if (columnItem.selected) {
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
      onChange(newSettings, question?._setMLv2Query(newQuery));
    },
    [question, query, columnSettings, onChange],
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

      onChange(newSettings, question?._setMLv2Query(newQuery));
    },
    [question, query, columnSettings, onChange],
  );

  const showAddRemoveAll = (columns: ColumnMetadataItem[]) => {
    return (
      !columns.some(
        columnItem => columnItem.isAggregation || columnItem.isBreakout,
      ) && !search
    );
  };

  console.log(metadataColumnGroups);

  return (
    <div>
      <Button variant="subtle" pl="0" onClick={() => onWidgetOverride(null)}>
        Done picking columns
      </Button>
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
          >
            <Text fz="lg" fw={700} mb="1rem">
              {columnGroup.displayName}
            </Text>
            {showAddRemoveAll(columnGroup.columns) && (
              <Box mb="0.75rem">
                {areAllColumnsInQuery(columnGroup.columns) ? (
                  <StackedCheckBox
                    label={<Text fw={700} ml="0.75rem">{t`Remove all`}</Text>}
                    checked={true}
                    onClick={() =>
                      removeAllColumnsFromTable(columnGroup.columns)
                    }
                  />
                ) : (
                  <StackedCheckBox
                    label={<Text fw={700} ml="0.75rem">{t`Add all`}</Text>}
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
                    <Flex ml="0.75rem" align="center">
                      <Icon name={getColumnIcon(columnItem.column)}></Icon>
                      <Text span ml="0.75rem">
                        {columnItem.displayName}
                      </Text>
                    </Flex>
                  }
                  checked={columnItem.selected}
                  onClick={() => toggleColumn(columnItem)}
                  disabled={columnItem.isBreakout || columnItem.isAggregation}
                />
              </Box>
            ))}
          </div>
        );
      })}
    </div>
  );
};
