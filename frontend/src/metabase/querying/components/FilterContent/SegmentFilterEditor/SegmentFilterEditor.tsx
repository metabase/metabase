import { t } from "ttag";

import { Flex, Grid, MultiSelect, Text, Icon } from "metabase/ui";

import type { SegmentItem } from "../types";

interface SegmentFilterEditorProps {
  segmentItems: SegmentItem[];
  onChange: (newSegmentItems: SegmentItem[]) => void;
}

export function SegmentFilterEditor({
  segmentItems,
  onChange,
}: SegmentFilterEditorProps) {
  const options = segmentItems.map((segmentItem, segmentIndex) => ({
    value: String(segmentIndex),
    label: segmentItem.displayName,
    isSelected: segmentItem.filterPositions.length > 0,
  }));

  const data = options.map(({ value, label }) => ({ value, label }));
  const value = options.filter(item => item.isSelected).map(item => item.value);

  const handleChange = (newValue: string[]) => {
    const newSegments = newValue
      .map(segmentIndex => Number(segmentIndex))
      .map(segmentIndex => segmentItems[segmentIndex]);
    onChange(newSegments);
  };

  return (
    <Grid grow>
      <Grid.Col span="auto">
        <Flex h="100%" align="center" gap="sm">
          <Icon name="filter" />
          <Text color="text-dark" weight="bold">
            {t`Filter down to a segment`}
          </Text>
        </Flex>
      </Grid.Col>
      <Grid.Col span={4}>
        <MultiSelect
          data={data}
          value={value}
          placeholder={t`Filter segments`}
          nothingFound={t`No matching segment found.`}
          aria-label={t`Filter segments`}
          searchable
          onChange={handleChange}
        />
      </Grid.Col>
    </Grid>
  );
}
