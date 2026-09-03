import { Fragment } from "react";

import { Grid, Paper, type PaperProps, Stack, Text } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";

const theme = getThemeOverrides();

const PAPER_PADDING_OPTIONS = ["0", "lg", "xl", "xxl"] as const;
const PAPER_RADIUS_OPTIONS = ["xxs", "md"] as const;
const shadowOptions = Object.keys(theme.shadows ?? {});

const args = {
  p: "0",
  radius: "xxs",
  shadow: "xs_outline",
  withBorder: false,
};

const sampleArgs = {
  text: "The elm tree planted by Eleanor Bold, the judge’s daughter, fell last night.",
};

const argTypes = {
  p: {
    options: PAPER_PADDING_OPTIONS,
    control: { type: "inline-radio" },
  },
  radius: {
    options: PAPER_RADIUS_OPTIONS,
    control: { type: "inline-radio" },
  },
  shadow: {
    options: shadowOptions,
    control: { type: "inline-radio" },
  },
  withBorder: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = (args: PaperProps) => (
  <Paper {...args}>
    <Text>{sampleArgs.text}</Text>
  </Paper>
);

const ShadowMatrixTemplate = (args: PaperProps) => (
  <Stack gap="xxl" maw="24rem">
    {shadowOptions.map((shadow) => (
      <Paper key={shadow} {...args} p="xl" shadow={shadow}>
        <Text fw="bold">Shadow {shadow}</Text>
      </Paper>
    ))}
  </Stack>
);

const GridTemplate = (args: PaperProps) => (
  <Grid
    columns={argTypes.radius.options.length + 1}
    align="center"
    gutter="xxl"
  >
    <Grid.Col span={1} />
    {argTypes.radius.options.map((radius) => (
      <Grid.Col key={radius} span={1}>
        <Text fw="bold">Radius {radius}</Text>
      </Grid.Col>
    ))}
    {argTypes.p.options.flatMap((padding) => (
      <Fragment key={padding}>
        <Grid.Col span={1}>
          <Text fw="bold">Padding {padding}</Text>
        </Grid.Col>
        {argTypes.radius.options.map((radius) => (
          <Grid.Col key={radius} span={1}>
            <Paper {...args} p={padding} radius={radius}>
              <Text>{sampleArgs.text}</Text>
            </Paper>
          </Grid.Col>
        ))}
      </Fragment>
    ))}
  </Grid>
);

export default {
  title: "Components/Utils/Paper",
  component: Paper,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const ShadowMatrix = {
  render: ShadowMatrixTemplate,
  name: "Shadow matrix",
};

export const NoBorder = {
  render: GridTemplate,
};

export const Border = {
  render: GridTemplate,
  args: {
    withBorder: true,
  },
};
