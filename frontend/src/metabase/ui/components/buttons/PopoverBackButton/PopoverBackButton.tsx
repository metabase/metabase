import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import type { BoxProps } from "../../utils";
import { Button } from "../Button";

export type PopoverBackButtonProps = { withArrow?: boolean } & BoxProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color">;

export function PopoverBackButton(props: PopoverBackButtonProps) {
  const { withArrow = true, ...rest } = props;
  return (
    <Button
      p={0}
      aria-label={t`Back`}
      c="text-primary"
      fz="1rem"
      lh="1.25rem"
      {...rest}
      variant="subtle"
      leftSection={withArrow && <Icon name="chevronleft" />}
    />
  );
}
