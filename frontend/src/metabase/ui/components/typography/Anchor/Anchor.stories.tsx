import { Fragment } from "react";

import { Anchor, type AnchorProps, Grid, Text } from "metabase/ui";

const args = {
  size: "md",
  align: "unset",
  truncate: false,
};

const sampleArgs = {
  text: "Weniger",
  href: "https://example.test",
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
  truncate: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = (args: AnchorProps) => (
  <Anchor {...args} href={sampleArgs.href}>
    {sampleArgs.text}
  </Anchor>
);

const SizeTemplate = (args: AnchorProps) => (
  <Grid align="center" maw="18rem">
    {argTypes.size.options.map(size => (
      <Fragment key={size}>
        <Grid.Col span={2}>
          <Text weight="bold">{size}</Text>
        </Grid.Col>
        <Grid.Col span={10}>
          <Anchor {...args} size={size} href={sampleArgs.href}>
            {sampleArgs.text}
          </Anchor>
        </Grid.Col>
      </Fragment>
    ))}
  </Grid>
);

export default {
  title: "Typography/Anchor",
  component: Anchor,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Sizes = {
  render: SizeTemplate,
};
