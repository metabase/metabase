import { Flex, Stack, Text } from "metabase/ui";

import { ActionButton, type ActionButtonProps } from "./";

const waitASecond = () => new Promise((resolve) => setTimeout(resolve, 1000));
const failAfterASecond = () =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Failed")), 1000),
  );

const argTypes = {
  variant: {
    options: ["default", "filled", "outline", "subtle", "inverse"],
    control: { type: "inline-radio" },
  },
  color: {
    options: {
      default: undefined,
      brand: "brand",
      success: "success",
      error: "error",
    },
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
  useLoadingSpinner: {
    control: { type: "boolean" },
  },
  activeText: {
    control: { type: "text" },
  },
  successText: {
    control: { type: "text" },
  },
  failedText: {
    control: { type: "text" },
  },
  normalText: {
    control: { type: "text" },
  },
};

const DefaultTemplate = (args: ActionButtonProps) => (
  <Flex gap="md">
    <Stack>
      <Text>Success</Text>
      <ActionButton {...args} actionFn={waitASecond} />
    </Stack>
    <Stack>
      <Text>Failure</Text>
      <ActionButton {...args} actionFn={failAfterASecond} />
    </Stack>
  </Flex>
);

const VariantTemplate = (args: ActionButtonProps) => (
  <Flex gap="md">
    <Stack w="10rem">
      <Text>Success</Text>
      <ActionButton {...args} actionFn={waitASecond} variant="filled" />
      <ActionButton {...args} actionFn={waitASecond} variant="default" />
      <ActionButton {...args} actionFn={waitASecond} variant="light" />
      <ActionButton {...args} actionFn={waitASecond} variant="outline" />
      <ActionButton {...args} actionFn={waitASecond} variant="subtle" />
    </Stack>
    <Stack w="10rem">
      <Text>Failure</Text>
      <ActionButton {...args} actionFn={failAfterASecond} variant="filled" />
      <ActionButton {...args} actionFn={failAfterASecond} variant="default" />
      <ActionButton {...args} actionFn={failAfterASecond} variant="light" />
      <ActionButton {...args} actionFn={failAfterASecond} variant="outline" />
      <ActionButton {...args} actionFn={failAfterASecond} variant="subtle" />
    </Stack>
  </Flex>
);

export default {
  title: "Components/Buttons/ActionButton",
  component: ActionButton,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};

export const Variants = {
  render: VariantTemplate,
};
