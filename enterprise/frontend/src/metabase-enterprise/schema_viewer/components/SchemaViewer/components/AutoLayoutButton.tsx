import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

type AutoLayoutButtonProps = {
  onClick: () => void;
};

/**
 * Triggers the parent's `relayout` (full Dagre auto-layout). Stays a
 * presentation-only component — no React Flow access needed.
 */
export function AutoLayoutButton({ onClick }: AutoLayoutButtonProps) {
  return (
    <Button
      bg="background-primary"
      variant="default"
      leftSection={<Icon name="sparkles" />}
      onClick={onClick}
    >
      {t`Auto-layout`}
    </Button>
  );
}
