import { t } from "ttag";
import { Box, Center, SegmentedControl } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { ActivePreviewPane } from "../../EmbedModal";

const CODE_PREVIEW_CONTROL_OPTIONS = [
  {
    label: (
      <Center>
        <Icon name="embed" />
        <Box ml="0.5rem">{t`Code`}</Box>
      </Center>
    ),
    value: "code",
  },
  {
    label: (
      <Center>
        <Icon name="eye_filled" />
        <Box ml="0.5rem">{t`Preview`}</Box>
      </Center>
    ),
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
