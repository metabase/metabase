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
      variant="transparent"
      size="compact-md"
      color="neutral"
      p={0}
      aria-label={t`Back`}
      {...rest}
      leftSection={withArrow && <Icon name="chevronleft" />}
    />
  );
}
