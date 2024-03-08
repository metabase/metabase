import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

import type { BoxProps } from "../../utils";
import { Button } from "../Button";

export type PopoverBackButtonProps = BoxProps &
  ButtonHTMLAttributes<HTMLButtonElement>;

export function PopoverBackButton(props: PopoverBackButtonProps) {
  return (
    <Button
      p={0}
      aria-label={t`Back`}
      c="text-dark"
      fz="1rem"
      lh="1.25rem"
      {...props}
      variant="subtle"
      leftIcon={<Icon name="chevronleft" />}
    />
  );
}
