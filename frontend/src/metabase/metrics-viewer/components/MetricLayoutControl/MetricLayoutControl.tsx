import type {
  MetricsViewerDisplayType,
  MetricsViewerTabLayoutState,
} from "metabase/metrics-viewer/types";
import { DISPLAY_TYPE_REGISTRY } from "metabase/metrics-viewer/utils";
import {
  ActionIcon,
  Center,
  Divider,
  HoverCard,
  Icon,
  Slider,
} from "metabase/ui";

const ACTIVE_BUTTON_PROPS = {
  c: "brand" as const,
  bg: "background-selected" as const,
};

export const MetricLayoutControl = ({
  displayType,
  value,
  onChange,
  seriesCount,
}: {
  displayType: MetricsViewerDisplayType;
  value: MetricsViewerTabLayoutState;
  onChange: (val: MetricsViewerTabLayoutState) => void;
  seriesCount: number;
}) => {
  const { split, spacing } = value;

  const { supportsMultipleSeries } = DISPLAY_TYPE_REGISTRY[displayType];

  return (
    <ActionIcon.Group bd="1px solid var(--mb-color-border)" bdrs="md">
      {seriesCount > 1 && (
        <>
          {supportsMultipleSeries ? (
            <>
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
                    onClick={() =>
                      onChange({
                        ...value,
                        split: true,
                        spacing: value.spacing || seriesCount,
                      })
                    }
                    {...(split && ACTIVE_BUTTON_PROPS)}
                  >
                    <Icon name="layout_grid" />
                  </ActionIcon>
                </HoverCard.Target>
                <HoverCard.Dropdown px="md" py="sm" bdrs="xl">
                  <Slider
                    w="8rem"
                    value={spacing}
                    min={2}
                    max={8}
                    marks={new Array(8)
                      .fill(0)
                      .map((_v, i) => ({ value: i + 1 }))}
                    onChange={(val) => onChange({ ...value, spacing: val })}
                  />
                </HoverCard.Dropdown>
              </HoverCard>
            </>
          ) : (
            <Center px="md">
              <Slider
                w="8rem"
                value={spacing}
                min={2}
                max={8}
                marks={new Array(8).fill(0).map((_v, i) => ({ value: i + 1 }))}
                onChange={(val) => onChange({ ...value, spacing: val })}
              />
            </Center>
          )}

          <Divider orientation="vertical" />
        </>
      )}
      <ActionIcon c="text-primary" size="lg">
        <Icon name="expand" />
      </ActionIcon>
    </ActionIcon.Group>
  );
};
