import type { ButtonHTMLAttributes } from "react";

import type { BoxProps } from "../../utils";
import { Button } from "../Button";

export type NotificationButtonProps = BoxProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

export function NotificationButton(props: NotificationButtonProps) {
  return (
    <Button
      c="var(--mb-color-text-white)"
      bg="color-mix(in srgb, var(--mb-color-bg-white) 10%, transparent 90%)"
      {...props}
    />
  );
}
