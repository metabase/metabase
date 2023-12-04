import type { ButtonHTMLAttributes } from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { Button } from "metabase/ui";
import type { ButtonProps } from "metabase/ui";

type BackButtonProps = ButtonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function BackButton(props: BackButtonProps) {
  return (
    <Button
      c="text.2"
      fz="1rem"
      variant="subtle"
      leftIcon={<Icon name="chevronleft" />}
      aria-label={t`Back`}
      {...props}
    />
  );
}
