import { t } from "ttag";

import { Box, Group, Icon, type IconName, SegmentedControl } from "metabase/ui";

import type { ActivePreviewPane } from "./types";

const ControlOptionItem = ({
  label,
  iconName,
}: {
  label: string;
  iconName: IconName;
}) => (
  <Group noWrap px="sm" spacing="xs">
    <Icon name={iconName} />
    <Box>{label}</Box>
  </Group>
);

const CODE_PREVIEW_CONTROL_OPTIONS = [
  {
    label: <ControlOptionItem label={t`Code`} iconName="embed" />,
    value: "code",
  },
  {
    label: <ControlOptionItem label={t`Preview`} iconName="eye_filled" />,
    value: "preview",
  },
];

interface PreviewModeSelectorProps {
  value: ActivePreviewPane;
  onChange: (pane: ActivePreviewPane) => void;
}

export const PreviewModeSelector = ({
  value,
  onChange,
}: PreviewModeSelectorProps): JSX.Element => (
  <SegmentedControl
    value={value}
    data={CODE_PREVIEW_CONTROL_OPTIONS}
    onChange={onChange}
  />
);
