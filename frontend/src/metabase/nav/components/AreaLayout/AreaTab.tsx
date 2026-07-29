import cx from "classnames";
import type { ReactNode } from "react";

import { ForwardRefLink } from "metabase/common/components/Link";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { Box, FixedSizeIcon, Flex, Text, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./AreaLayout.module.css";
import { TOOLTIP_OPEN_DELAY } from "./constants";

type AreaTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected?: boolean;
  showLabel: boolean;
  rightSection?: ReactNode;
  isGated?: boolean;
  onClick?: () => void;
};

export function AreaTab({
  label,
  icon,
  to,
  isSelected,
  showLabel,
  rightSection,
  isGated,
  onClick,
}: AreaTabProps) {
  const upsellGem = isGated ? <UpsellGem.New size={14} /> : null;
  const effectiveRightSection = rightSection ?? upsellGem;

  return (
    <Tooltip
      label={label}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
      disabled={showLabel}
    >
      <Flex
        className={cx(S.tab, { [S.selected]: isSelected })}
        component={ForwardRefLink}
        to={to}
        onClick={onClick}
        p="sm"
        gap="sm"
        bdrs="md"
        aria-label={label}
        aria-current={isSelected ? "page" : undefined}
        justify={showLabel ? "start" : "center"}
      >
        <FixedSizeIcon name={icon} display="block" className={S.icon} />
        {showLabel && <Text lh="sm">{label}</Text>}
        {effectiveRightSection && (
          <Box
            className={showLabel ? undefined : S.badgeOverlay}
            ml={showLabel ? "auto" : undefined}
          >
            {effectiveRightSection}
          </Box>
        )}
      </Flex>
    </Tooltip>
  );
}
