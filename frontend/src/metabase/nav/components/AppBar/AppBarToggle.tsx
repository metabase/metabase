import { useHover } from "@mantine/hooks";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { isMac } from "metabase/lib/browser";
import { ActionIcon, Stack, Box, Card, Icon, Tooltip } from "metabase/ui";

import { SidebarButton, SidebarIcon } from "./AppBarToggle.styled";

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
  const [showQuickActions, setShowQuickActions] = useState(false);
  let timer = useRef(null);

  // when user clicks the sidebar button, never show the
  // tooltip as long as their cursor remains on the button
  // but show it again next time they hover
  useEffect(() => {
    if (!hovered) {
      setDisableTooltip(false);
      setShowQuickActions(false);
      timer.current = setTimeout(() => {
        setShowQuickActions(false);
      }, 200);
    }
    if (hovered) {
      timer.current = setTimeout(() => {
        setDisableTooltip(true);
        setShowQuickActions(true);
      }, 2000);
    }
    return () => {
      clearTimeout(timer.current);
    };
  }, [hovered]);

  if (!isNavBarEnabled) {
    return null;
  }

  const handleToggleClick = () => {
    setDisableTooltip(true);
    onToggleClick?.();
  };

  return (
    <Box ref={hoverRef as React.Ref<HTMLDivElement>} w="46px" h="46px">
      <Card
        top={0}
        variant={showQuickActions && !isNavBarOpen ? "default" : "subtle"}
        pt="0"
        px="sm"
      >
        <Stack>
          <Tooltip
            label={getSidebarTooltipLabel(isNavBarOpen)}
            disabled={isSmallAppBar || disableTooltip}
            withArrow
            offset={-12}
            openDelay={1000}
          >
            <SidebarButton
              isSmallAppBar={isSmallAppBar}
              isNavBarEnabled={isNavBarEnabled}
              isLogoVisible={isLogoVisible}
              onClick={handleToggleClick}
              data-testid="sidebar-toggle"
              aria-label={t`Toggle sidebar`}
            >
              <SidebarIcon
                isLogoVisible={isLogoVisible}
                size={20}
                name="sidebar_open"
              />
            </SidebarButton>
          </Tooltip>
          <Box
            style={{
              visibility:
                showQuickActions && !isNavBarOpen ? "visible" : "hidden",
            }}
          >
            <ActionIcon>
              <Icon name="add" />
            </ActionIcon>
            <ActionIcon>
              <Icon name="search" />
            </ActionIcon>
            <ActionIcon>
              <Icon name="ai" />
            </ActionIcon>
          </Box>
        </Stack>
      </Card>
    </Box>
  );
}

const getSidebarTooltipLabel = (isNavBarOpen?: boolean) => {
  const message = isNavBarOpen ? t`Close sidebar` : t`Open sidebar`;
  const shortcut = isMac() ? "(⌘ + .)" : "(Ctrl + .)";
  return `${message} ${shortcut}`;
};
