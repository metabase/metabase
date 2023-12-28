import { t } from "ttag";
import { Button } from "metabase/ui";
import type { ButtonProps } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

interface TimeToggleProps extends ButtonProps {
  hasTime: boolean;
  onClick?: () => void;
}

export function TimeToggle({ hasTime, ...props }: TimeToggleProps) {
  return (
    <Button
      c="text.1"
      variant="subtle"
      leftIcon={<Icon name="clock" />}
      {...props}
    >
      {hasTime ? t`Remove time` : t`Add time`}
    </Button>
  );
}
