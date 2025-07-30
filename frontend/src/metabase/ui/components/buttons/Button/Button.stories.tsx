import { Fragment } from "react";
import { within } from "storybook/test";

import { Group, Icon, Stack } from "metabase/ui";

import { Button, type ButtonProps } from "./";

const args = {
  variant: "default",
  color: undefined,
  size: "md",
  disabled: false,
  fullWidth: false,
  radius: "md",
  loading: false,
};

const argTypes = {
  variant: {
    options: ["default", "filled", "outline", "subtle", "inverse"],
    control: { type: "inline-radio" },
  },
  color: {
    options: { default: undefined, success: "success", error: "error" },
    control: { type: "inline-radio" },
  },
  size: {
    control: {
      type: "select",
      options: [
        "xs",
        "sm",
        "md",
        "lg",
        "xl",
        "compact-xs",
        "compact-sm",
        "compact-md",
        "compact-lg",
        "compact-xl",
      ],
    },
  },
  disabled: {
    control: { type: "boolean" },
  },
  fullWidth: {
    control: { type: "boolean" },
  },
  radius: {
    options: ["md", "xl"],
    control: { type: "inline-radio" },
  },
  loading: {
    control: { type: "boolean" },
  },
  loaderPosition: {
    options: ["left", "right"],
    control: { type: "inline-radio" },
  },
};

const DefaultTemplate = (args: ButtonProps) => (
  <Button {...args}>Button</Button>
);

const ButtonGroupTemplate = (args: ButtonProps) => (
  <Button.Group>
    <Button {...args}>One</Button>
    <Button {...args}>Two</Button>
    <Button {...args}>Three</Button>
  </Button.Group>
);

const GridRow = (args: ButtonProps) => (
  <Group wrap="nowrap">
    <Button {...args}>Save</Button>
    <Button {...args} leftSection={<Icon name="add" />}>
      New
    </Button>
    <Button {...args} rightSection={<Icon name="chevrondown" />}>
      Category
    </Button>
    <Button {...args} leftSection={<Icon name="play" />} />
  </Group>
);

const GridRowGroup = (args: ButtonProps) => (
  <Fragment>
    <GridRow {...args} />
    <GridRow {...args} radius="xl" />
  </Fragment>
);

const GridTemplate = (args: ButtonProps) => (
  <Stack>
    <GridRowGroup {...args} variant="filled" />
    <GridRowGroup {...args} variant="outline" />
    <GridRowGroup {...args} variant="default" />
    <GridRow {...args} variant="subtle" />
    <GridRow {...args} variant="inverse" />
  </Stack>
);

const LoadingGridRow = (args: ButtonProps) => (
  <Group wrap="nowrap">
    <Button {...args}>Save</Button>
    <Button {...args}>Save</Button>
    <Button {...args} leftSection={<Icon name="play" />} />
  </Group>
);

const LoadingGridRowGroup = (args: ButtonProps) => (
  <Fragment>
    <LoadingGridRow {...args} />
    <LoadingGridRow {...args} radius="xl" />
  </Fragment>
);

const LoadingGridTemplate = (args: ButtonProps) => (
  <Stack>
    <LoadingGridRowGroup {...args} variant="filled" />
    <LoadingGridRowGroup {...args} variant="outline" />
    <LoadingGridRowGroup {...args} variant="default" />
    <LoadingGridRow {...args} variant="subtle" />
    <LoadingGridRow {...args} variant="inverse" />
  </Stack>
);

export default {
  title: "Components/Buttons/Button",
  component: Button,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const ButtonGroup = {
  render: ButtonGroupTemplate,
  name: "Button group",
};

export const DefaultSize = {
  render: GridTemplate,
  name: "Default size",
};

export const DefaultSizeCustomColor = {
  render: GridTemplate,
  name: "Default size, custom color",
  args: {
    color: "error",
  },
};

export const DefaultSizeDisabled = {
  render: GridTemplate,
  name: "Default size, disabled",
  args: {
    disabled: true,
  },
};

export const DefaultSizeLoading = {
  render: LoadingGridTemplate,
  name: "Default size, loading",
  args: {
    loading: true,
  },
};

export const DefaultSizeFullWidth = {
  render: GridTemplate,
  name: "Default size, full width",
  args: {
    fullWidth: true,
  },
};

export const DefaultSizeFullWidthDisabled = {
  render: GridTemplate,
  name: "Default size, full width, disabled",
  args: {
    disabled: true,
    fullWidth: true,
  },
};

export const DefaultSizeFullWidthLoading = {
  render: LoadingGridTemplate,
  name: "Default size, full width, loading",
  args: {
    loading: true,
    fullWidth: true,
  },
};

export const CompactSize = {
  render: GridTemplate,
  name: "Compact size",
  args: {
    size: "compact-md",
  },
};

export const CompactSizeCustomColor = {
  render: GridTemplate,
  name: "Compact size, custom color",
  args: {
    color: "error",
    size: "compact-md",
  },
  play: async ({ canvasElement }: { canvasElement: HTMLCanvasElement }) => {
    const canvas = within(canvasElement);
    const button = (
      await canvas.findAllByRole("button", {
        name: "Save",
      })
    )[0];
    button.classList.add("pseudo-hover");
  },
};

export const CompactSizeDisabled = {
  render: GridTemplate,
  name: "Compact size, disabled",
  args: {
    size: "compact-md",
    disabled: true,
  },
};

export const CompactSizeLoading = {
  render: LoadingGridTemplate,
  name: "Compact size, loading",
  args: {
    size: "compact-md",
    loading: true,
  },
};

export const CompactSizeFullWidth = {
  render: GridTemplate,
  name: "Compact size, full width",
  args: {
    size: "compact-md",
    fullWidth: true,
  },
};

export const CompactSizeFullWidthDisabled = {
  render: GridTemplate,
  name: "Compact size, full width, disabled",
  args: {
    size: "compact-md",
    disabled: true,
    fullWidth: true,
  },
};

export const CompactSizeFullWidthLoading = {
  render: LoadingGridTemplate,
  name: "Compact size, full width, loading",
  args: {
    size: "compact-md",
    loading: true,
    fullWidth: true,
  },
};
