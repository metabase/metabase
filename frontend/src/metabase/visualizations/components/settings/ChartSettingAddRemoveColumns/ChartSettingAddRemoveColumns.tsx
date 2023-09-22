import { useCallback, useState } from "react";
import { t } from "ttag";
import type Question from "metabase-lib/Question";
import { Button, Checkbox, TextInput } from "metabase/ui";
import { Box, Flex, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { DatasetColumn } from "metabase-types/api";
import { getColumnIcon } from "metabase/common/utils/columns";
import { StackedCheckBox } from "metabase/components/StackedCheckBox/StackedCheckBox";
import {
  getColumnGroups,
  getMetadataColumns,
  enableColumnInQuery,
  disableColumnInQuery,
  findColumnSettingIndex,
  removeColumnFromSettings,
  addColumnInSettings,
} from "../ChartSettingTableColumns/utils";

import type {
  ColumnSetting,
  ColumnMetadataItem,
} from "../ChartSettingTableColumns/types";

import * as Lib from "metabase-lib";
import { isNotFalsy } from "metabase/core/utils/types";

interface ChartSettingAddRemoveColumnsProps {
  question: Question;
  value: ColumnSetting[];
  onChange: (value: ColumnSetting[], quesion?: Question) => void;
  columns: DatasetColumn[];
  onWidgetOverride: (key: string | null) => void;
}

export const ChartSettingAddRemoveColumns = ({
  value: columnSettings,
  onChange,
  question,
  columns,
  onWidgetOverride,
}: ChartSettingAddRemoveColumnsProps) => {
  const [search, setSearch] = useState("");
  const query = question._getMLv2Query();

  const metadataColumnGroups = getColumnGroups(
    query,
    getMetadataColumns(query),
  );

  //const datasetRefs = columns.map(({ field_ref }) => field_ref);
  const datasetRefs = columnSettings
    .map(({ fieldRef }) => fieldRef)
    .filter(isNotFalsy);

  const isColumnInQuery = (column: Lib.ColumnMetadata) => {
    const columnSettingIndex = findColumnSettingIndex(
      query,
      column,
      columnSettings,
    );

    return columnSettingIndex !== -1;
  };

  const areAllColumnsInQuery = (columns: ColumnMetadataItem[]) => {
    return columns
      .map(({ column }) =>
        Lib.findColumnIndexesFromLegacyRefs(
          query,
          -1,
          [column],
          datasetRefs,
        ).some(index => index !== -1),
      )
      .every(result => result);
  };

  const addAllColumnsFromTable = (columns: ColumnMetadataItem[]) => {
    let newQuery = query;
    let newSettings = columnSettings;
    columns.forEach(columnItem => {
      if (!isColumnInQuery(columnItem.column)) {
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
      const columnSettingIndex = findColumnSettingIndex(
        newQuery,
        columnItem.column,
        newSettings,
      );

      if (columnSettingIndex !== -1) {
        console.log("removing column", columnItem.displayName);
        newSettings = removeColumnFromSettings(newSettings, {
          columnSettingIndex,
        });

        newQuery = disableColumnInQuery(newQuery, {
          metadataColumn: columnItem,
        });
      }
    });

    onChange(newSettings, question?._setMLv2Query(newQuery));
  };

  const toggleColumn = (columnItem: ColumnMetadataItem) => {
    const { column } = columnItem;
    if (isColumnInQuery(column)) {
      handleDisableColumn(column);
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
    [query, columnSettings, onChange],
  );

  const handleDisableColumn = useCallback(
    (columnItem: Lib.ColumnMetadata) => {
      const columnSettingIndex = findColumnSettingIndex(
        query,
        columnItem,
        columnSettings,
      );
      const newSettings = removeColumnFromSettings(columnSettings, {
        columnSettingIndex,
      });

      const newQuery = disableColumnInQuery(query, {
        metadataColumn: columnItem,
      });

      onChange(newSettings, question?._setMLv2Query(newQuery));
    },
    [query, columnSettings, onChange],
  );

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
          <>
            <Text fz="lg" fw={700} mb="1rem">
              {columnGroup.displayName}
            </Text>
            {!search && (
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
                    label={<Text fw={700} ml="0.75rem">{t`Select all`}</Text>}
                    checked={false}
                    onClick={() => addAllColumnsFromTable(columnGroup.columns)}
                  />
                )}
              </Box>
            )}
            {filteredColumns.map(columnItem => (
              <Box mb="1rem">
                <Checkbox
                  label={
                    <Flex ml="0.75rem" align="center">
                      <Icon name={getColumnIcon(columnItem.column)}></Icon>
                      <Text span ml="0.75rem">
                        {columnItem.displayName}
                      </Text>
                    </Flex>
                  }
                  checked={isColumnInQuery(columnItem.column)}
                  onClick={() => toggleColumn(columnItem)}
                />
              </Box>
            ))}
          </>
        );
      })}
    </div>
  );
};
