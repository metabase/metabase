import type { ButtonProps as MantineButtonProps } from "@mantine/core";

export { Button } from "@mantine/core";
export type { ButtonGroupProps } from "@mantine/core";
export { getButtonOverrides } from "./Button.styled";

export type ExtraButtonProps = {
  animate?: boolean;
};
export type ButtonProps = MantineButtonProps & ExtraButtonProps;
