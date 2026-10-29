import {
  Switch as MantineSwitch,
  type SwitchProps as MantineSwitchProps,
} from "@mantine/core";
import { forwardRef } from "react";

/** `size` is omitted: the design system has a single `xs` switch. */
export type SwitchProps = Omit<MantineSwitchProps, "size">;

const SwitchRoot = forwardRef<HTMLInputElement, SwitchProps>(
  function SwitchRoot(props, ref) {
    return <MantineSwitch {...props} ref={ref} />;
  },
);

export const Switch = Object.assign(SwitchRoot, {
  Group: MantineSwitch.Group,
});

export type { SwitchGroupProps } from "@mantine/core";
export { switchOverrides } from "./Switch.config";
