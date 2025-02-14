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
  <Group wrap="nowrap" px="sm" gap="xs">
    <Icon name={iconName} />
    <Box>{label}</Box>
  </Group>
);

const CODE_PREVIEW_CONTROL_OPTIONS = [
  {
    label: <ControlOptionItem label={t`Code`} iconName="embed" />,
    value: "code" as ActivePreviewPane,
  },
  {
    label: <ControlOptionItem label={t`Preview`} iconName="eye_filled" />,
    value: "preview" as ActivePreviewPane,
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
