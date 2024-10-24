import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getQuestion } from "metabase/query_builder/selectors";
import {
  Icon,
  type IconName,
  SegmentedControl,
  type SegmentedControlProps,
  Tooltip,
} from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type { QueryBuilderView } from "metabase-types/store";

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

export const EditorViewControl = ({
  availableControls = ["editor", "table", "visualization"],
  ...restProps
}: Partial<SegmentedControlProps> & {
  availableControls?: QueryBuilderView[];
}) => {
  const question = useSelector(getQuestion);
  const vizIcon = question
    ? getIconForVisualizationType(question.display())
    : "line";

  const options = [
    {
      value: "editor" as const,
      label: (
        <EditorViewLabelItem tooltipLabel={t`Editor`} iconName="notebook" />
      ),
    },
    {
      value: "table" as const,
      label: <EditorViewLabelItem tooltipLabel={t`Result`} iconName="table2" />,
    },
    {
      value: "visualization" as const,
      label: (
        <EditorViewLabelItem
          tooltipLabel={t`Visualization`}
          iconName={vizIcon}
        />
      ),
    },
  ].filter(({ value }) => availableControls.includes(value));

  return (
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
      data={options}
      {...restProps}
    />
  );
};
