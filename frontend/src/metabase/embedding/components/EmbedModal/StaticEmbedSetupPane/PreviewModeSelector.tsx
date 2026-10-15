import { t } from "ttag";

import { SegmentedControl, type SegmentedControlItem } from "metabase/ui";

import type { ActivePreviewPane } from "./types";

const getCodePreviewControlOptions =
  (): SegmentedControlItem<ActivePreviewPane>[] => [
    { label: t`Code`, icon: "embed", value: "code" },
    { label: t`Preview`, icon: "eye_filled", value: "preview" },
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
    data={getCodePreviewControlOptions()}
    onChange={onChange}
  />
);
