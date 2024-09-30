import { Fragment } from "react";

import { Grid, Text } from "metabase/ui";

const args = {
  size: "md",
  align: "unset",
  weight: "normal",
  italic: false,
  underline: false,
  strikethrough: false,
  truncate: false,
  lineClamp: undefined,
};

const sampleArgs = {
  shortText: "Weniger",
  longText:
    "Having small touches of colour makes it more colourful than having the whole thing in colour",
};

const argTypes = {
  size: {
    options: ["xs", "sm", "md", "lg"],
    control: { type: "inline-radio" },
  },
  align: {
    options: ["left", "center", "right"],
    control: { type: "inline-radio" },
  },
  weight: {
    options: ["normal", "bold"],
    control: { type: "inline-radio" },
  },
  italic: {
    control: { type: "boolean" },
  },
  underline: {
    control: { type: "boolean" },
  },
  strikethrough: {
    control: { type: "boolean" },
  },
  truncate: {
    control: { type: "boolean" },
  },
  lineClamp: {
    control: { type: "number" },
  },
};

const DefaultTemplate = args => <Text {...args}>{sampleArgs.shortText}</Text>;

const SizeTemplate = args => (
  <Grid align="center" maw="18rem">
    {argTypes.size.options.map(size => (
      <Fragment key={size}>
        <Grid.Col span={2}>
          <Text weight="bold">{size}</Text>
        </Grid.Col>
        <Grid.Col span={10}>
          <Text {...args} size={size} />
        </Grid.Col>
      </Fragment>
    ))}
  </Grid>
);

export default {
  title: "Typography/Text",
  component: Text,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  name: "Default",
};

export const Sizes = {
  render: SizeTemplate,
  name: "Sizes",
  args: {
    children: sampleArgs.shortText,
  },
};

export const Multiline = {
  render: SizeTemplate,
  name: "Multiline",
  args: {
    children: sampleArgs.longText,
  },
};

export const Truncated = {
  render: SizeTemplate,
  name: "Truncated",
  args: {
    children: sampleArgs.longText,
    lineClamp: 2,
  },
};
