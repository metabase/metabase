import {
  FixedSizeIcon,
  Flex,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./AreaLayout.module.css";
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
      <Flex
        className={S.navButton}
        component={UnstyledButton}
        onClick={onClick}
        p="sm"
        gap="sm"
        bdrs="md"
        aria-label={label}
        justify="center"
      >
        <FixedSizeIcon name={icon} display="block" className={S.icon} />
        {showLabel && (
          <Text lh="sm" fw="bold" c="inherit">
            {label}
          </Text>
        )}
      </Flex>
    </Tooltip>
  );
}
