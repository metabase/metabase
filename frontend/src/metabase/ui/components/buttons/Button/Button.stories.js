import { Fragment } from "react";

import { Group, Icon, Stack } from "metabase/ui";

import { Button } from "./";

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

const DefaultTemplate = args => <Button {...args}>Button</Button>;

const ButtonGroupTemplate = args => (
  <Button.Group>
    <Button {...args}>One</Button>
    <Button {...args}>Two</Button>
    <Button {...args}>Three</Button>
  </Button.Group>
);

const GridRow = args => (
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

const GridRowGroup = args => (
  <Fragment>
    <GridRow {...args} />
    <GridRow {...args} radius="xl" />
  </Fragment>
);

const GridTemplate = args => (
  <Stack>
    <GridRowGroup {...args} variant="filled" />
    <GridRowGroup {...args} variant="outline" />
    <GridRowGroup {...args} variant="default" />
    <GridRow {...args} variant="subtle" />
  </Stack>
);

const LoadingGridRow = args => (
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

const LoadingGridRowGroup = args => (
  <Fragment>
    <LoadingGridRow {...args} />
    <LoadingGridRow {...args} radius="xl" />
  </Fragment>
);

const LoadingGridTemplate = args => (
  <Stack>
    <LoadingGridRowGroup {...args} variant="filled" />
    <LoadingGridRowGroup {...args} variant="outline" />
    <LoadingGridRowGroup {...args} variant="default" />
    <LoadingGridRow {...args} variant="subtle" />
  </Stack>
);

const Default = DefaultTemplate.bind({});
const ButtonGroup = ButtonGroupTemplate.bind({});
const DefaultGrid = GridTemplate.bind({});
const CustomColorGrid = GridTemplate.bind({});
const DefaultDisabledGrid = GridTemplate.bind({});
const DefaultLoadingGrid = LoadingGridTemplate.bind({});
const DefaultFullWidthGrid = GridTemplate.bind({});
const DefaultDisabledFullWidthGrid = GridTemplate.bind({});
const DefaultLoadingFullWidthGrid = LoadingGridTemplate.bind({});
const CompactGrid = GridTemplate.bind({});
const CompactCustomColorGrid = GridTemplate.bind({});
const CompactDisabledGrid = GridTemplate.bind({});
const CompactLoadingGrid = LoadingGridTemplate.bind({});
const CompactFullWidthGrid = GridTemplate.bind({});
const CompactDisabledFullWidthGrid = GridTemplate.bind({});
const CompactLoadingFullWidthGrid = LoadingGridTemplate.bind({});

export default {
  title: "Buttons/Button",
  component: Button,
  args,
  argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const ButtonGroup_ = {
  render: ButtonGroup,
  name: "Button group",
};

export const DefaultSize = {
  render: DefaultGrid,
  name: "Default size",
};

export const DefaultSizeCustomColor = {
  render: CustomColorGrid,
  name: "Default size, custom color",
  args: {
    color: "error",
  },
};

export const DefaultSizeDisabled = {
  render: DefaultDisabledGrid,
  name: "Default size, disabled",
  args: {
    disabled: true,
  },
};

export const DefaultSizeLoading = {
  render: DefaultLoadingGrid,
  name: "Default size, loading",
  args: {
    loading: true,
  },
};

export const DefaultSizeFullWidth = {
  render: DefaultFullWidthGrid,
  name: "Default size, full width",
  args: {
    fullWidth: true,
  },
};

export const DefaultSizeFullWidthDisabled = {
  render: DefaultDisabledFullWidthGrid,
  name: "Default size, full width, disabled",
  args: {
    disabled: true,
    fullWidth: true,
  },
};

export const DefaultSizeFullWidthLoading = {
  render: DefaultLoadingFullWidthGrid,
  name: "Default size, full width, loading",
  args: {
    loading: true,
    fullWidth: true,
  },
};

export const CompactSize = {
  render: CompactGrid,
  name: "Compact size",
  args: {
    compact: true,
  },
};

export const CompactSizeCustomColor = {
  render: CompactCustomColorGrid,
  name: "Compact size, custom color",
  args: {
    color: "error",
    compact: true,
  },
};

export const CompactSizeDisabled = {
  render: CompactDisabledGrid,
  name: "Compact size, disabled",
  args: {
    compact: true,
    disabled: true,
  },
};

export const CompactSizeLoading = {
  render: CompactLoadingGrid,
  name: "Compact size, loading",
  args: {
    compact: true,
    loading: true,
  },
};

export const CompactSizeFullWidth = {
  render: CompactFullWidthGrid,
  name: "Compact size, full width",
  args: {
    compact: true,
    fullWidth: true,
  },
};

export const CompactSizeFullWidthDisabled = {
  render: CompactDisabledFullWidthGrid,
  name: "Compact size, full width, disabled",
  args: {
    compact: true,
    disabled: true,
    fullWidth: true,
  },
};

export const CompactSizeFullWidthLoading = {
  render: CompactLoadingFullWidthGrid,
  name: "Compact size, full width, loading",
  args: {
    compact: true,
    loading: true,
    fullWidth: true,
  },
};
