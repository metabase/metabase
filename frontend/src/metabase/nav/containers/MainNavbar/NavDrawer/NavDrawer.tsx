import { useClickOutside } from "@mantine/hooks";
import { type ReactNode, useEffect, useState } from "react";
import { t } from "ttag";

import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";
import { useLocation } from "metabase/router";
import { ActionIcon, Box, Group, Icon, Text } from "metabase/ui";

import S from "./NavDrawer.module.css";

export type NavDrawerProps = {
  title: string;
  opened: boolean;
  onClose: () => void;
  /** Right side of the drawer's title row, e.g. a create action. */
  actions?: ReactNode;
  /** The rail node, so clicking the trigger row does not count as clicking outside. */
  railNode?: HTMLElement | null;
  children: ReactNode;
};

/**
 * Slides out from the right edge of the rail and floats over the content. Kept mounted so both
 * transitions run, and `inert` while closed so it stays out of focus and assistive tech.
 */
export function NavDrawer({
  title,
  opened,
  onClose,
  actions,
  railNode,
  children,
}: NavDrawerProps) {
  const [drawerNode, setDrawerNode] = useState<HTMLElement | null>(null);
  const { pathname } = useLocation();

  useClickOutside(
    () => {
      if (opened) {
        onClose();
      }
    },
    null,
    [drawerNode, railNode].filter((node): node is HTMLElement => node != null),
  );

  // Navigating away from under an open drawer means you picked something; the drawer's work is done.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only pathname should retrigger this
  }, [pathname]);

  useEffect(() => {
    if (!opened) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [opened, onClose]);

  return (
    <Box
      ref={setDrawerNode}
      component="aside"
      // Unjustified type cast. FIXME: `inert` lands in React's DOM types in 19.
      {...({ inert: opened ? undefined : "" } as { inert?: string })}
      aria-label={title}
      className={opened ? `${S.drawer} ${S.opened}` : S.drawer}
      style={{ insetInlineStart: NAV_SIDEBAR_WIDTH }}
    >
      <Group
        justify="space-between"
        align="center"
        px="lg"
        py="md"
        wrap="nowrap"
        className={S.header}
      >
        <Text fw="bold" size="sm">
          {title}
        </Text>
        <Group gap="xs" wrap="nowrap">
          {actions}
          <ActionIcon
            aria-label={t`Close ${title}`}
            color="text-secondary"
            onClick={onClose}
          >
            <Icon name="close" />
          </ActionIcon>
        </Group>
      </Group>
      <Box className={S.body}>{children}</Box>
    </Box>
  );
}
