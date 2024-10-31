import { t } from "ttag";

import {
  Icon,
  type IconName,
  SegmentedControl,
  type SegmentedControlProps,
  Tooltip,
} from "metabase/ui";

const EditorViewLabelItem = ({
  tooltipLabel,
  iconName,
}: {
  tooltipLabel: string;
  iconName: IconName;
}) => (
  <Tooltip label={tooltipLabel} offset={10}>
    <Icon name={iconName} size="1rem" />
  </Tooltip>
);

const EDITOR_VIEW_OPTIONS = [
  {
    value: "editor",
    label: <EditorViewLabelItem tooltipLabel={t`Editor`} iconName="notebook" />,
  },
  {
    value: "table",
    label: <EditorViewLabelItem tooltipLabel={t`Result`} iconName="table2" />,
  },
  {
    value: "visualization",
    label: (
      <EditorViewLabelItem tooltipLabel={t`Visualization`} iconName="line" />
    ),
  },
];

export const EditorViewControl = ({
  data = EDITOR_VIEW_OPTIONS,
  ...restProps
}: Partial<SegmentedControlProps>) => (
  <SegmentedControl
    radius="xl"
    styles={{
      root: {
        backgroundColor: "var(--mb-color-brand-lighter)",
        color: "var(--mb-color-brand)",
      },
      label: {
        display: "inline-flex",
        color: "var(--mb-color-brand)",
        "&[data-active]": {
          "&, &:hover": {
            color: "var(--mb-color-white)",
          },
        },
        // this really should be design token values
        padding: `4px 10px`,
      },
      controlActive: {
        color: "var(--mb-color-bg-white)",
      },
      indicator: {
        backgroundColor: "var(--mb-color-brand)",
        color: "var(--mb-color-bg-white)",
      },
      control: {
        "&:not(:first-of-type)": {
          border: "none",
        },
      },
    }}
    data={data}
    {...restProps}
  />
);
