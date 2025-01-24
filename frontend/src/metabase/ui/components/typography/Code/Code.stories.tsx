import type { ComponentMeta } from "@storybook/react";

import { Code, type CodeProps } from "metabase/ui";

const InlineTemplate = (args: CodeProps) => (
  <Code {...args}>React.createElement()</Code>
);

const CODE_BLOCK = `import React from 'react';
import { Code } from '@mantine/core';

function Demo() {
  return <Code>React.createElement()</Code>;
}`;
const BlockTemplate = (args: CodeProps) => <Code {...args}>{CODE_BLOCK}</Code>;

export default {
  title: "Typography/Code",
  component: Code,
  argTypes: {
    bg: {
      control: { type: "color" },
    },
  },
  args: {
    block: false,
  },
  parameters: {
    backgrounds: {
      default: "light",
      values: [
        {
          name: "light",
          value: "white",
        },
      ],
    },
  },
} as ComponentMeta<typeof Code>;

export const Inline = {
  render: InlineTemplate,
};

export const Block = {
  render: BlockTemplate,
  args: {
    block: true,
  },
};
