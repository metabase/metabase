import { Fragment } from "react";

import { Grid, Paper, type PaperProps, Text } from "metabase/ui";

const args = {
  p: "md",
  radius: "md",
  shadow: "md",
  withBorder: false,
};

const sampleArgs = {
  text: "The elm tree planted by Eleanor Bold, the judge’s daughter, fell last night.",
};

const argTypes = {
  p: {
    options: ["xs", "sm", "md", "lg", "xl"],
    control: { type: "inline-radio" },
  },
  radius: {
    options: ["xs", "sm", "md"],
    control: { type: "inline-radio" },
  },
  shadow: {
    options: ["xs", "sm", "md", "lg", "xl"],
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

const GridTemplate = (args: PaperProps) => (
  <Grid columns={argTypes.radius.options.length + 1} align="center" gutter="xl">
    <Grid.Col span={1} />
    {argTypes.radius.options.map(radius => (
      <Grid.Col key={radius} span={1}>
        <Text weight="bold">Radius {radius}</Text>
      </Grid.Col>
    ))}
    {argTypes.p.options.flatMap(padding => (
      <Fragment key={padding}>
        <Grid.Col span={1}>
          <Text weight="bold">Padding {padding}</Text>
        </Grid.Col>
        {argTypes.radius.options.map(radius => (
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
  title: "Utils/Paper",
  component: Paper,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
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
