import cx from "classnames";
import type { ReactNode } from "react";

import { ForwardRefLink } from "metabase/common/components/Link";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { Box, Ellipsified, FixedSizeIcon, Flex, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./AreaLayout.module.css";
import { TOOLTIP_OPEN_DELAY } from "./constants";

type AreaTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected?: boolean;
  showLabel: boolean;
  /**
   * Rendered before the icon, inside the row. Sits above the row's click target, so controls
   * placed here (an expand toggle, say) can be used without following the link.
   */
  leftSection?: ReactNode;
  /** Rendered at the end of the row; like `leftSection`, controls here do not follow the link. */
  rightSection?: ReactNode;
  isGated?: boolean;
  onClick?: () => void;
};

/**
 * A sidebar row that is one link. The link itself only wraps the icon and label, but stretches
 * its click target over the whole row, so any controls in the side sections remain separate
 * interactive elements rather than being nested inside the anchor.
 */
export function AreaTab({
  label,
  icon,
  to,
  isSelected,
  showLabel,
  leftSection,
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
        p="sm"
        gap="sm"
        bdrs="sm"
        align="center"
        data-testid="area-tab"
      >
        {leftSection && <Box className={S.tabSection}>{leftSection}</Box>}
        <Flex
          className={S.tabLink}
          component={ForwardRefLink}
          to={to}
          onClick={onClick}
          gap="sm"
          align="center"
          aria-label={label}
          aria-current={isSelected ? "page" : undefined}
          justify={showLabel ? "start" : "center"}
        >
          <FixedSizeIcon name={icon} display="block" className={S.icon} />
          {showLabel && (
            <Ellipsified
              c="text-primary"
              fz="md"
              lh="sm"
              tooltipProps={{
                position: "right",
                openDelay: TOOLTIP_OPEN_DELAY,
              }}
            >
              {label}
            </Ellipsified>
          )}
        </Flex>
        {effectiveRightSection && (
          <Box
            className={cx(S.tabSection, { [S.badgeOverlay]: !showLabel })}
            ml={showLabel ? "auto" : undefined}
          >
            {effectiveRightSection}
          </Box>
        )}
      </Flex>
    </Tooltip>
  );
}
