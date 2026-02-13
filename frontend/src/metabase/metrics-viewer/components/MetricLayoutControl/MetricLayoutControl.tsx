import {
  ActionIcon,
  Divider,
  Icon,
  NumberInput,
  Popover,
  Select,
  Stack,
  Switch,
  Text,
} from "metabase/ui";

import S from "./MetricLayoutControl.module.css";
import { t } from "ttag";
import { MetricsViewerTabLayoutState } from "metabase/metrics-viewer/types";

export const MetricLayoutControl = ({
  value,
  onChange,
}: {
  value: MetricsViewerTabLayoutState;
  onChange: (val: MetricsViewerTabLayoutState) => void;
}) => {
  const { split, spacing, customSpacing } = value;
  return (
    <ActionIcon.Group bd="1px solid var(--mb-color-border)" bdrs="md">
      <Popover>
        <Popover.Target>
          <ActionIcon c="text-primary" size="lg">
            <Icon name="layout" />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown w={256} style={{ overflow: "unset" }}>
          <Stack p="md">
            <Switch
              label={<Text fw="bold" size="md">{t`Split charts`}</Text>}
              size="xs"
              labelPosition="left"
              classNames={{
                labelWrapper: S.SplitChartsLabelWrapper,
              }}
              checked={split}
              onChange={(event) => {
                onChange({ ...value, split: event.currentTarget.checked });
              }}
            />
            {split && (
              <>
                <Select
                  label={t`Spacing`}
                  value={spacing}
                  data={["comfortable", "compact", "custom"]}
                  onChange={(val) => {
                    onChange({ ...value, spacing: val });
                  }}
                  comboboxProps={{
                    withinPortal: false,
                    position: "top",
                  }}
                />

                {spacing === "custom" && (
                  <NumberInput
                    value={customSpacing}
                    label={t`Columns`}
                    hideControls={false}
                    onChange={(v) =>
                      onChange({
                        ...value,
                        customSpacing: typeof v === "number" ? v || 1 : 1,
                      })
                    }
                  />
                )}
              </>
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
      <Divider orientation="vertical" />
      <ActionIcon c="text-primary" size="lg">
        <Icon name="expand" />
      </ActionIcon>
    </ActionIcon.Group>
  );
};
