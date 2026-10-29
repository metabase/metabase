import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Box, Stack, Switch, type SwitchProps } from "metabase/ui";
import {
  StoryBoard,
  StoryJsx,
  StorySection,
} from "metabase/ui/stories/showcase";

const args = {
  labelPosition: "right",
  label: "Eat all the cheese",
  description: undefined,
  disabled: false,
};

const argTypes = {
  labelPosition: {
    control: { type: "inline-radio" },
    options: ["left", "right"],
  },
  label: {
    control: { type: "text" },
  },
  description: {
    control: { type: "text" },
  },
  disabled: {
    control: { type: "boolean" },
  },
};

export default {
  title: "Components/Inputs/Switch",
  component: Switch,
  args,
  argTypes,
};

export const Default = {};

const OVERVIEW_STATES = [
  { id: "default", attrs: "", props: {} },
  { id: "checked", attrs: " defaultChecked", props: { defaultChecked: true } },
  { id: "disabled", attrs: " disabled", props: { disabled: true } },
  {
    id: "disabled-checked",
    attrs: " disabled defaultChecked",
    props: { disabled: true, defaultChecked: true },
  },
];

const LABEL_POSITIONS = [
  { id: "right", attrs: "", props: {} },
  {
    id: "left",
    attrs: ' labelPosition="left"',
    props: { labelPosition: "left" },
  },
] as const;

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "18rem 20rem 20rem",
  columnGap: "1.5rem",
  rowGap: "1rem",
  alignItems: "center",
} as const;

const StateMatrix = ({ withDescription }: { withDescription: boolean }) => (
  <Box style={gridStyle}>
    <div />
    {LABEL_POSITIONS.map(({ id, attrs }) => (
      <StoryJsx
        key={id}
      >{`<Switch label="…"${withDescription ? ' description="…"' : ""}${attrs} />`}</StoryJsx>
    ))}
    {OVERVIEW_STATES.map(({ id, attrs, props }) => (
      <Fragment key={id}>
        <StoryJsx>{`<Switch${attrs} />`}</StoryJsx>
        {LABEL_POSITIONS.map(({ id: positionId, props: positionProps }) => (
          <Switch
            key={positionId}
            label="Label"
            description={withDescription ? "Description" : undefined}
            {...positionProps}
            {...props}
          />
        ))}
      </Fragment>
    ))}
  </Box>
);

const OverviewTemplate: StoryFn<SwitchProps> = () => (
  <StoryBoard title="Switch" padding="2rem">
    <StorySection title="Label and description">
      <StateMatrix withDescription />
    </StorySection>

    <StorySection title="Label only">
      <StateMatrix withDescription={false} />
    </StorySection>

    <StorySection title="Error">
      <Box style={gridStyle}>
        <StoryJsx>{'<Switch error="…" />'}</StoryJsx>
        <Switch
          label="Label"
          description="Description"
          error="Something went wrong"
        />
        <Switch
          label="Label"
          description="Description"
          error="Something went wrong"
          labelPosition="left"
        />
      </Box>
    </StorySection>
  </StoryBoard>
);

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    controls: { disable: true },
  },
};

const GroupTemplate: StoryFn<SwitchProps> = () => (
  <StoryBoard title="Switch.Group">
    <Stack gap="1.5rem">
      <StoryJsx>{"<Switch.Group />"}</StoryJsx>
      <Switch.Group
        defaultValue={["email"]}
        label="Notifications"
        description="Choose what you want to hear about"
      >
        <Stack gap="0.75rem" mt="1rem" w="16rem">
          <Switch value="email" label="Email" />
          <Switch value="slack" label="Slack" />
          <Switch value="pager" label="Pager" />
        </Stack>
      </Switch.Group>
    </Stack>
    <Stack gap="1.5rem">
      <StoryJsx>{"<Switch.Group /> (with descriptions)"}</StoryJsx>
      <Switch.Group
        defaultValue={["email"]}
        label="Notifications"
        description="Choose what you want to hear about"
      >
        <Stack gap="0.75rem" mt="1rem" w="16rem">
          <Switch
            value="email"
            label="Email"
            description="Delivered once a day"
          />
          <Switch
            value="slack"
            label="Slack"
            description="Delivered as they happen"
          />
          <Switch
            value="pager"
            label="Pager"
            description="For critical alerts only"
          />
        </Stack>
      </Switch.Group>
    </Stack>
  </StoryBoard>
);

export const Group = {
  name: "Switch.Group",
  render: GroupTemplate,
  parameters: {
    controls: { disable: true },
  },
};
