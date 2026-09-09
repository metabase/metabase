import cx from "classnames";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  forwardRef,
} from "react";

import {
  Box,
  Ellipsified,
  FixedSizeIcon,
  Flex,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./AreaLayout.module.css";
import { TOOLTIP_OPEN_DELAY } from "./constants";

type AreaTabButtonProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "children"
> & {
  label: string;
  icon: IconName;
  isSelected?: boolean;
  showLabel: boolean;
  rightSection?: ReactNode;
};

/**
 * A sidebar row that is a button rather than a link, for a control that opens something in place
 * (a flyout, a modal) instead of navigating. Looks like `AreaTab`; forwards its ref and any
 * button props so it can be a `Popover.Target`.
 */
export const AreaTabButton = forwardRef<HTMLButtonElement, AreaTabButtonProps>(
  function AreaTabButton(
    { label, icon, isSelected, showLabel, rightSection, className, ...props },
    ref,
  ) {
    return (
      <Tooltip
        label={label}
        position="right"
        openDelay={TOOLTIP_OPEN_DELAY}
        disabled={showLabel}
      >
        <UnstyledButton
          ref={ref}
          className={cx(S.tab, className, { [S.selected]: isSelected })}
          p="sm"
          bdrs="sm"
          aria-label={label}
          aria-current={isSelected ? "true" : undefined}
          data-testid="area-tab"
          {...props}
        >
          <Flex
            flex="1 1 auto"
            miw={0}
            gap="sm"
            align="center"
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
          {rightSection && (
            <Box
              className={cx(S.tabSection, { [S.badgeOverlay]: !showLabel })}
              ml={showLabel ? "auto" : undefined}
            >
              {rightSection}
            </Box>
          )}
        </UnstyledButton>
      </Tooltip>
    );
  },
);
