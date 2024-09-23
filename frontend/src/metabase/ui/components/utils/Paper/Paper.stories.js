import { Fragment } from "react";

import { Grid, Paper, Text } from "metabase/ui";

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

const DefaultTemplate = args => (
  <Paper {...args}>
    <Text>{sampleArgs.text}</Text>
  </Paper>
);

const GridTemplate = args => (
  <Grid columns={argTypes.radius.options.length + 1} align="center" gutter="xl">
    <Grid.Col span={1} />
    {argTypes.radius.options.map(radius => (
      <Grid.Col key={radius} span={1} align="center">
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

const Default = DefaultTemplate.bind({});
const NoBorder = GridTemplate.bind({});
const Border = GridTemplate.bind({});

export default {
  title: "Utils/Paper",
  component: Paper,
  args: args,
  argTypes: argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const NoBorder_ = {
  render: NoBorder,
  name: "No border",
};

export const Border_ = {
  render: Border,
  name: "Border",
  args: {
    withBorder: true,
  },
};
