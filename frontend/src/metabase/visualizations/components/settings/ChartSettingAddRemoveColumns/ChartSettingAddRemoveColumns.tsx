import { useCallback } from "react";
import { t } from "ttag";
import type Question from "metabase-lib/Question";
import { Checkbox } from "metabase/ui";
import { Box, Flex, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { ConcreteFieldReference, DatasetColumn } from "metabase-types/api";
import { getColumnIcon } from "metabase/common/utils/columns";
import StackedCheckBox from "metabase/components/StackedCheckBox/StackedCheckBox";
import {
  getColumnGroups,
  getMetadataColumns,
  enableColumnInQuery,
  enableColumnInSettings,
  disableColumnInQuery,
  disableColumnInSettings,
  findColumnSettingIndex,
} from "../ChartSettingTableColumns/utils";

import type {
  ColumnSetting,
  ColumnMetadataItem,
} from "../ChartSettingTableColumns/types";

import * as Lib from "metabase-lib";

interface ChartSettingAddRemoveColumnsProps {
  question: Question;
  value: ColumnSetting[];
  onChange: (value: ColumnSetting[], quesion?: Question) => void;
  columns: DatasetColumn[];
}

export const ChartSettingAddRemoveColumns = ({
  value: columnSettings,
  onChange,
  question,
  columns,
}: ChartSettingAddRemoveColumnsProps) => {
  const query = question._getMLv2Query();

  const metadataColumnGroups = getColumnGroups(
    query,
    getMetadataColumns(query),
  );

  console.log(metadataColumnGroups);
  console.log(columns);

  const datasetRefs = columns.map(({ field_ref }) => field_ref);
  // const columnSettingsRefs = columnSettings.map((fieldRef) => fieldRef)

  const isColumnInQuery = (column: Lib.ColumnMetadata) => {
    const indexes = Lib.findColumnIndexesFromLegacyRefs(
      query,
      -1,
      [column],
      datasetRefs,
    );

    return indexes.some(index => index >= 0);
  };

  const areAllColumnsInQuery = (columns: Lib.ColumnMetadata) => {
    const indexes = Lib.findColumnIndexesFromLegacyRefs(
      query,
      -1,
      columns,
      datasetRefs,
    );

    return indexes.every(index => index >= 0);
  };

  const toggleColumn = (columnItem: ColumnMetadataItem) => {
    const { column } = columnItem;
    if (isColumnInQuery(column)) {
      handleDisableColumn(column);
    } else {
      handleEnableColumn(column);
    }
  };

  const handleEnableColumn = useCallback(
    (columnItem: Lib.ColumnMetadata) => {
      const index = findColumnSettingIndex(query, columnItem, columnSettings);
      const newSettings = enableColumnInSettings(columnSettings, { index });
      const newQuery = enableColumnInQuery(query, {
        metadataColumn: columnItem,
      });
      onChange(newSettings, question?._setMLv2Query(newQuery));
    },
    [query, columnSettings, onChange],
  );

  const handleDisableColumn = useCallback(
    (columnItem: Lib.ColumnMetadata) => {
      const index = findColumnSettingIndex(query, columnItem, columnSettings);
      const newSettings = disableColumnInSettings(columnSettings, { index });
      const newQuery = disableColumnInQuery(query, {
        metadataColumn: columnItem,
      });
      onChange(newSettings, question?._setMLv2Query(newQuery));
    },
    [query, columnSettings, onChange],
  );

  return (
    <div>
      {metadataColumnGroups.map(columnGroup => (
        <>
          <Text fz="lg" fw={700} mb="1rem">
            {columnGroup.displayName}
          </Text>
          <Box mb="0.75rem">
            {areAllColumnsInQuery(columnGroup.columns) ? (
              <StackedCheckBox
                label={<Text fw={700} ml="0.75rem">{t`Remove all`}</Text>}
                checked={true}
                // onClick={() => removeAllColumnsForTable(questionTable)}
              />
            ) : (
              <StackedCheckBox
                label={<Text fw={700} ml="0.75rem">{t`Select all`}</Text>}
                checked={false}
                // onClick={() => enableAllColumnsForTable(questionTable)}
              />
            )}
          </Box>
          {columnGroup.columns.map(column => (
            <Box mb="1rem">
              <Checkbox
                label={
                  <Flex ml="0.75rem" align="center">
                    <Icon name={getColumnIcon(column.column)}></Icon>
                    <Text span ml="0.75rem">
                      {column.displayName}
                    </Text>
                  </Flex>
                }
                checked={isColumnInQuery(column.column)}
                onClick={() => toggleColumn(column)}
              />
            </Box>
          ))}
        </>
      ))}
    </div>
  );

  return <p>Hello World</p>;
};
