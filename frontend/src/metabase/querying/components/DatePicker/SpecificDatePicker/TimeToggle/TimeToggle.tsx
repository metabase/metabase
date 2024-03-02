import { t } from "ttag";

import type { ButtonProps } from "metabase/ui";
import { Button, Icon } from "metabase/ui";

interface TimeToggleProps extends ButtonProps {
  hasTime: boolean;
  onClick?: () => void;
}

export function TimeToggle({ hasTime, ...props }: TimeToggleProps) {
  return (
    <Button
      c="text-medium"
      variant="subtle"
      leftIcon={<Icon name="clock" />}
      {...props}
    >
      {hasTime ? t`Remove time` : t`Add time`}
    </Button>
  );
}
