import { Fragment } from "react";

import { Group, Icon, Stack } from "metabase/ui";

import { Button, type ButtonProps } from "./";

const args = {
  variant: "default",
  color: undefined,
  compact: false,
  disabled: false,
  fullWidth: false,
  radius: "md",
  loading: false,
  loaderPosition: "left",
};

const argTypes = {
  variant: {
    options: ["default", "filled", "outline", "subtle"],
    control: { type: "inline-radio" },
  },
  color: {
    options: { default: undefined, success: "success", error: "error" },
    control: { type: "inline-radio" },
  },
  compact: {
    control: { type: "boolean" },
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
  <Group noWrap>
    <Button {...args}>Save</Button>
    <Button {...args} leftIcon={<Icon name="add" />}>
      New
    </Button>
    <Button {...args} rightIcon={<Icon name="chevrondown" />}>
      Category
    </Button>
    <Button {...args} leftIcon={<Icon name="play" />} />
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
  </Stack>
);

const LoadingGridRow = (args: ButtonProps) => (
  <Group noWrap>
    <Button {...args} loaderPosition="left">
      Save
    </Button>
    <Button {...args} loaderPosition="right">
      Save
    </Button>
    <Button {...args} leftIcon={<Icon name="play" />} />
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
  </Stack>
);

export default {
  title: "Buttons/Button",
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
  render: ButtonGroupTemplate,
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
    compact: true,
  },
};

export const CompactSizeCustomColor = {
  render: GridTemplate,
  name: "Compact size, custom color",
  args: {
    color: "error",
    compact: true,
  },
};

export const CompactSizeDisabled = {
  render: GridTemplate,
  name: "Compact size, disabled",
  args: {
    compact: true,
    disabled: true,
  },
};

export const CompactSizeLoading = {
  render: LoadingGridTemplate,
  name: "Compact size, loading",
  args: {
    compact: true,
    loading: true,
  },
};

export const CompactSizeFullWidth = {
  render: GridTemplate,
  name: "Compact size, full width",
  args: {
    compact: true,
    fullWidth: true,
  },
};

export const CompactSizeFullWidthDisabled = {
  render: GridTemplate,
  name: "Compact size, full width, disabled",
  args: {
    compact: true,
    disabled: true,
    fullWidth: true,
  },
};

export const CompactSizeFullWidthLoading = {
  render: LoadingGridTemplate,
  name: "Compact size, full width, loading",
  args: {
    compact: true,
    loading: true,
    fullWidth: true,
  },
};
