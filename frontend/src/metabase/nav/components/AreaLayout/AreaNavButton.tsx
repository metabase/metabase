import { Button, FixedSizeIcon, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY } from "./constants";

type AreaNavButtonProps = {
  label: string;
  icon: IconName;
  showLabel: boolean;
  onClick: () => void;
};

/**
 * An action in the nav, sitting alongside the [[AreaTab]]s but not one of them:
 * it goes nowhere, so it is a button and never reads as the current page.
 */
export function AreaNavButton({
  label,
  icon,
  showLabel,
  onClick,
}: AreaNavButtonProps) {
  return (
    <Tooltip
      label={label}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
      disabled={showLabel}
    >
      <Button
        variant="light"
        size="md"
        fullWidth
        leftSection={<FixedSizeIcon name={icon} display="block" />}
        onClick={onClick}
        aria-label={label}
      >
        {showLabel && label}
      </Button>
    </Tooltip>
  );
}
