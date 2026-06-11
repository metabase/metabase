import {
  Kbd as MantineKbd,
  type KbdProps as MantineKbdProps,
} from "@mantine/core";
import { forwardRef } from "react";

export interface KbdProps extends MantineKbdProps {
  /** Render the key in a disabled (dimmed) style. */
  disabled?: boolean;
}

export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd(
  { disabled, ...props },
  ref,
) {
  return (
    <MantineKbd ref={ref} data-disabled={disabled || undefined} {...props} />
  );
});
