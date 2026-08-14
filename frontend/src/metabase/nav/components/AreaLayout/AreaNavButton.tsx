import type { ReactNode } from "react";

import {
  Box,
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
  rightSection?: ReactNode;
};

/**
 * An action in the nav, styled like an [[AreaTab]] but not one: it goes
 * nowhere, so it is a button and never reads as the current page.
 */
export function AreaNavButton({
  label,
  icon,
  showLabel,
  onClick,
  rightSection,
}: AreaNavButtonProps) {
  return (
    <Tooltip
      label={label}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
      disabled={showLabel}
    >
      <Flex
        className={S.tab}
        component={UnstyledButton}
        onClick={onClick}
        p="sm"
        gap="sm"
        bdrs="md"
        aria-label={label}
        justify={showLabel ? "start" : "center"}
      >
        <FixedSizeIcon name={icon} display="block" className={S.icon} />
        {showLabel && <Text lh="sm">{label}</Text>}
        {rightSection && (
          <Box
            className={showLabel ? undefined : S.badgeOverlay}
            ml={showLabel ? "auto" : undefined}
          >
            {rightSection}
          </Box>
        )}
      </Flex>
    </Tooltip>
  );
}
