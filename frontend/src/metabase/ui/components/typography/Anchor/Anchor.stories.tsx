import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Anchor, type AnchorProps, Box, Text } from "metabase/ui";
import { StoryBoard, StoryJsx } from "metabase/ui/stories/showcase";

import S from "./Anchor.module.css";

const SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
const WEIGHTS = [
  { value: 400, props: {} },
  { value: 700, props: { fw: 700 } },
] as const;
const STATES = [
  { id: "default", label: "Default", underline: undefined },
  { id: "hover", label: "Hover", underline: "always" },
] as const;

const args = {
  size: "md",
  align: "unset",
  truncate: false,
};

const sampleArgs = {
  text: "This is a link",
  href: "https://example.test",
};

const argTypes = {
  size: {
    options: SIZES,
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

const anchorSelectorFor = (id: string) => `[data-state-row="${id}"].${S.root}`;

const DefaultTemplate = (args: AnchorProps) => (
  <Anchor {...args} href={sampleArgs.href}>
    {sampleArgs.text}
  </Anchor>
);

const OverviewTemplate: StoryFn<AnchorProps> = () => (
  <StoryBoard title="Anchor" padding="2rem">
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "6rem repeat(2, max-content)",
        columnGap: "2rem",
        rowGap: "1rem",
        alignItems: "center",
      }}
    >
      {SIZES.map((size) => (
        <Fragment key={size}>
          <div />
          {WEIGHTS.map((weight) => (
            <StoryJsx key={weight.value}>
              {weight.value === 400
                ? `<Anchor size="${size}" />`
                : `<Anchor size="${size}" fw={700} />`}
            </StoryJsx>
          ))}

          {STATES.map((state) => (
            <Fragment key={state.id}>
              <Text size="sm" c="text-secondary">
                {state.label}
              </Text>
              {WEIGHTS.map((weight) => (
                <Anchor
                  key={weight.value}
                  data-state-row={state.id}
                  href={sampleArgs.href}
                  size={size}
                  underline={state.underline}
                  {...weight.props}
                >
                  {sampleArgs.text}
                </Anchor>
              ))}
            </Fragment>
          ))}
        </Fragment>
      ))}
    </Box>
  </StoryBoard>
);

export default {
  title: "Components/Text/Anchor",
  component: Anchor,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      hover: anchorSelectorFor("hover"),
    },
    controls: { disable: true },
  },
};
