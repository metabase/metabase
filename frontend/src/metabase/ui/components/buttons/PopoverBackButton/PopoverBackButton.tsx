import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";

import { StaticIcon } from "../../icons/Icon/StaticIcon";
import ChevronLeftIcon from "../../icons/Icon/icons/chevronleft.svg?component";
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
      justify="flex-start"
      p={0}
      aria-label={t`Back`}
      {...rest}
      leftSection={
        withArrow && (
          <StaticIcon component={ChevronLeftIcon} name="chevronleft" />
        )
      }
    />
  );
}
