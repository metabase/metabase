import { useEffect, useState } from "react";
import { t } from "ttag";

import { Box, Divider, Icon, MultiSelect, Stack, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import { getEntityIcon, useListColumns } from "./ListView";
import S from "./ListView.module.css";
import { ListViewItem } from "./ListViewItem";

export const ListViewConfiguration = ({
  data,
  entityType,
  onChange,
  settings,
}: {
  data: DatasetData;
  entityType?: string;
  onChange: (settings: { left: string[]; right: string[] }) => void;
  settings?: ComputedVisualizationSettings;
}) => {
  const { cols } = data;

  // Use the same default inference as the list view
  const { titleColumn, subtitleColumn, rightColumns } = useListColumns(
    cols,
    settings?.viewSettings?.listSettings,
  );

  // Selected values
  const [leftValues, setLeftValues] = useState(() => [
    ...(titleColumn ? [titleColumn.name] : []),
    ...(subtitleColumn ? [subtitleColumn.name] : []),
  ]);
  useEffect(() => {
    setLeftValues([
      ...(titleColumn ? [titleColumn.name] : []),
      ...(subtitleColumn ? [subtitleColumn.name] : []),
    ]);
  }, [titleColumn, subtitleColumn]);
  const [rightValues, setRightValues] = useState(() =>
    rightColumns.map((col) => col?.name),
  );
  useEffect(() => {
    setRightValues(rightColumns.map((col) => col?.name));
  }, [rightColumns]);

  // All options from cols
  const allOptions = cols.map((col) => ({
    value: col.name,
    label: col.display_name,
  }));

  // Exclude options already used by any of the two selects, but keep the ones
  // selected in the respective select so tags render properly
  const used = new Set([...leftValues, ...rightValues]);
  const leftOptions = allOptions.filter(
    (opt) => !used.has(opt.value) || leftValues.includes(opt.value),
  );
  const rightOptions = allOptions.filter(
    (opt) => !used.has(opt.value) || rightValues.includes(opt.value),
  );

  // Helpers to map selected names to column objects
  const findColByName = (name?: string): DatasetColumn | undefined =>
    cols.find((c) => c.name === name);

  const selectedTitleColumn = findColByName(leftValues[0]);
  const selectedSubtitleColumn = findColByName(leftValues[1]) ?? null;
  const selectedRightColumns = rightValues
    .slice(0, 5)
    .map((n) => findColByName(n))
    .filter(Boolean) as DatasetColumn[];

  const firstRow = data.rows?.[0];
  const entityIcon = getEntityIcon(entityType);
  const emptySettings = {} as ComputedVisualizationSettings;

  const onConfigurationChange = ({
    left = leftValues,
    right = rightValues,
  }: {
    left: string[];
    right: string[];
  }) => {
    setLeftValues(left);
    setRightValues(right);
    onChange({ left, right });
  };

  return (
    <Stack
      h="100%"
      p="2rem"
      align="center"
      className={S.listViewContainer}
      style={{ "--grid-columns": Math.max(rightValues.length, 1) }}
    >
      <Stack justify="center" flex={1} maw="var(--max-width)" w="100%">
        <Text size="md" fw="bold">{t`Customize List columns`}</Text>
        <Box className={S.listViewConfigurationInputs}>
          {/* Icon placeholder */}
          <Box
            w={32}
            h={32}
            style={{
              border: "1px dashed var(--mb-color-border)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              backgroundColor: "var(--mb-color-background-light)",
            }}
          >
            <Icon
              tooltip="Not implemented yet, but we can add icon selection here"
              name={getEntityIcon(entityType)}
              size={16}
              c="text-light"
            />
          </Box>

          {/* Title + Subtitle */}
          <Box>
            <MultiSelect
              size="xs"
              miw="10rem"
              maw="33%"
              data={leftOptions}
              value={leftValues}
              onChange={(value) => onConfigurationChange({ left: value })}
              maxValues={2}
              placeholder={leftValues.length > 0 ? "" : "Title + Subtitle"}
            />
          </Box>

          {/* Right columns */}
          <Box>
            <MultiSelect
              size="xs"
              data={rightOptions}
              value={rightValues}
              onChange={(value) => onConfigurationChange({ right: value })}
              maxValues={5}
              placeholder={rightValues.length === 5 ? "" : "Right columns"}
            />
          </Box>
        </Box>
      </Stack>
      <Divider w="100%" maw="var(--max-width)" />
      <Stack
        w="100%"
        maw="var(--max-width)"
        flex={1}
        justify="center"
        className={S.listContainer}
      >
        <Text size="md" fw="bold">{t`Preview`}</Text>
        {firstRow ? (
          <ListViewItem
            row={firstRow}
            cols={cols}
            settings={emptySettings}
            entityIcon={entityIcon}
            imageColumn={undefined}
            titleColumn={selectedTitleColumn}
            subtitleColumn={selectedSubtitleColumn}
            rightColumns={selectedRightColumns}
            onClick={() => {}}
          />
        ) : (
          <Text c="text-medium">{t`No data to preview`}</Text>
        )}
      </Stack>
    </Stack>
  );
};
