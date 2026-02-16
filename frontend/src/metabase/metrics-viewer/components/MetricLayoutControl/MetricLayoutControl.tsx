import type { MetricsViewerTabLayoutState } from "metabase/metrics-viewer/types";
import { ActionIcon, Divider, HoverCard, Icon, Slider } from "metabase/ui";

const ACTIVE_BUTTON_PROPS = {
  c: "brand" as const,
  bg: "background-selected" as const,
};

export const MetricLayoutControl = ({
  value,
  onChange,
}: {
  value: MetricsViewerTabLayoutState;
  onChange: (val: MetricsViewerTabLayoutState) => void;
}) => {
  const { split, spacing } = value;
  return (
    <ActionIcon.Group bd="1px solid var(--mb-color-border)" bdrs="md">
      <ActionIcon
        c="text-primary"
        size="lg"
        onClick={() => onChange({ ...value, split: false })}
        {...(!split && ACTIVE_BUTTON_PROPS)}
      >
        <Icon name="layout_unified" />
      </ActionIcon>
      <HoverCard
        position="top"
        disabled={!split}
        offset={{
          mainAxis: 8,
          crossAxis: -12,
        }}
      >
        <HoverCard.Target>
          <ActionIcon
            c="text-primary"
            size="lg"
            onClick={() => onChange({ ...value, split: true })}
            {...(split && ACTIVE_BUTTON_PROPS)}
          >
            <Icon name="layout_grid" />
          </ActionIcon>
        </HoverCard.Target>
        <HoverCard.Dropdown w="8rem" px="md" py="sm" bdrs="xl">
          <Slider
            value={spacing}
            min={1}
            max={8}
            marks={new Array(8).fill(0).map((_v, i) => ({ value: i + 1 }))}
            onChange={(val) => onChange({ ...value, spacing: val })}
          />
        </HoverCard.Dropdown>
      </HoverCard>

      <Divider orientation="vertical" />
      <ActionIcon c="text-primary" size="lg">
        <Icon name="expand" />
      </ActionIcon>
    </ActionIcon.Group>
  );
};
