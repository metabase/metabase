import { useState } from "react";
import { t } from "ttag";

import { MetricsFilterPill } from "metabase/metrics-viewer/components/MetricsFilterPills/MetricsFilterPill";
import { Checkbox, Popover, Stack, Text } from "metabase/ui";
import type { SegmentId } from "metabase-types/api";

import type { CubeSegment } from "../../types";

export interface SegmentFilterPillProps {
  segments: CubeSegment[];
  selectedSegmentIds: SegmentId[];
  onChange: (segmentIds: SegmentId[]) => void;
}

export function SegmentFilterPill({
  segments,
  selectedSegmentIds,
  onChange,
}: SegmentFilterPillProps) {
  const [isOpened, setIsOpened] = useState(false);

  const selectedNames = segments
    .filter((segment) => selectedSegmentIds.includes(segment.id))
    .map((segment) => segment.name);
  const hasSelection = selectedNames.length > 0;

  const handleChange = (values: string[]) => {
    const selected = new Set(values);
    onChange(
      segments
        .filter((segment) => selected.has(String(segment.id)))
        .map((segment) => segment.id),
    );
  };

  return (
    <Popover
      opened={isOpened}
      position="bottom-start"
      transitionProps={{ duration: 0 }}
      onChange={setIsOpened}
    >
      <Popover.Target>
        <MetricsFilterPill
          colors={[]}
          fallbackIcon="segment"
          aria-label={t`Segment filter`}
          onClick={() => setIsOpened((prev) => !prev)}
          onRemoveClick={hasSelection ? () => onChange([]) : undefined}
        >
          {hasSelection ? (
            <Text component="span" fw={700} c="inherit" fz="inherit" lh="1">
              {selectedNames.join(", ")}
            </Text>
          ) : (
            t`Segment`
          )}
        </MetricsFilterPill>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Checkbox.Group
          value={selectedSegmentIds.map(String)}
          onChange={handleChange}
        >
          <Stack gap="sm">
            {segments.map((segment) => (
              <Checkbox
                key={segment.id}
                value={String(segment.id)}
                label={segment.name}
              />
            ))}
          </Stack>
        </Checkbox.Group>
      </Popover.Dropdown>
    </Popover>
  );
}
