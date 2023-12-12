import { useMemo } from "react";
import { t } from "ttag";
import { Flex, Grid, MultiSelect, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { SegmentItem } from "../types";

interface SegmentFilterEditorProps {
  segmentItems: SegmentItem[];
  onChange: (newSegmentItems: SegmentItem[]) => void;
}

export function SegmentFilterEditor({
  segmentItems,
  onChange,
}: SegmentFilterEditorProps) {
  const data = useMemo(() => {
    return segmentItems.map((segmentItem, segmentIndex) => ({
      value: String(segmentIndex),
      label: segmentItem.displayName,
      isSelected: segmentItem.filterPositions.length > 0,
    }));
  }, [segmentItems]);

  const value = useMemo(() => {
    return data.filter(item => item.isSelected).map(item => item.value);
  }, [data]);

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
          <Text color="text.2" weight="bold">
            {t`Filter down to a segment`}
          </Text>
        </Flex>
      </Grid.Col>
      <Grid.Col span={4}>
        <MultiSelect
          data={data}
          value={value}
          placeholder={t`Filter segments`}
          onChange={handleChange}
        />
      </Grid.Col>
    </Grid>
  );
}
