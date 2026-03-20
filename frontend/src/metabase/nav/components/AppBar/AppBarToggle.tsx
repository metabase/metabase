import { useHover } from "@mantine/hooks";
import cx from "classnames";
import type React from "react";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { isMac } from "metabase/lib/browser";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { Flex, Icon, Tooltip, rem } from "metabase/ui";

import S from "./AppBarToggle.module.css";

export interface AppBarToggleProps {
  isSmallAppBar?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
  isNavBarOpen?: boolean;
  onToggleClick?: () => void;
}

export function AppBarToggle({
  isSmallAppBar,
  isNavBarEnabled,
  isLogoVisible,
  isNavBarOpen,
  onToggleClick,
}: AppBarToggleProps): JSX.Element | null {
  const [disableTooltip, setDisableTooltip] = useState(false);
  const { hovered, ref: hoverRef } = useHover();

  // when user clicks the sidebar button, never show the
  // tooltip as long as their cursor remains on the button
  // but show it again next time they hover
  useEffect(() => {
    if (!hovered) {
      setDisableTooltip(false);
    }
  }, [hovered]);

  const handleToggleClick = () => {
    setDisableTooltip(true);
    onToggleClick?.();
  };

  useRegisterShortcut([
    {
      id: "toggle-navbar",
      perform: handleToggleClick,
    },
  ]);

  if (!isNavBarEnabled) {
    return null;
  }
  return (
    <div ref={hoverRef as React.Ref<HTMLDivElement>}>
      <Tooltip
        label={getSidebarTooltipLabel(isNavBarOpen)}
        disabled={isSmallAppBar || disableTooltip}
        withArrow
        offset={-12}
        openDelay={1000}
      >
        <Flex
          component="button"
          className={S.sidebarButton}
          align="center"
          justify="center"
          w={rem(36)}
          py={isSmallAppBar ? "sm" : "md"}
          px={0}
          onClick={handleToggleClick}
          data-testid="sidebar-toggle"
          aria-label={t`Toggle sidebar`}
        >
          <Icon
            className={cx(S.sidebarIcon, {
              [S.sidebarIconInactive]: !isLogoVisible,
            })}
            size={20}
            name="burger"
          />
        </Flex>
      </Tooltip>
    </div>
  );
}

const getSidebarTooltipLabel = (isNavBarOpen?: boolean) => {
  const message = isNavBarOpen ? t`Close sidebar` : t`Open sidebar`;
  const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
  return `${message} ${shortcut}`;
};
