import {
  Icon,
  SegmentedControl,
  type SegmentedControlProps,
  useMantineTheme,
} from "metabase/ui";

const EDITOR_VIEW_OPTIONS = [
  {
    value: "editor",
    label: <Icon name="notebook" />,
  },
  {
    value: "table",
    label: <Icon name="table2" />,
  },
  {
    value: "visualization",
    label: <Icon name="line" />,
  },
];

export const EditorViewControl = ({
  data = EDITOR_VIEW_OPTIONS,
  ...restProps
}: Partial<SegmentedControlProps>) => {
  const theme = useMantineTheme();
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
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
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
};
