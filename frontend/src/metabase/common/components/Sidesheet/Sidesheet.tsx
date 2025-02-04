import cx from "classnames";
import type React from "react";
import { useMemo } from "react";
import { t } from "ttag";
import { uniqueId } from "underscore";

import Animation from "metabase/css/core/animation.module.css";
import { Drawer, type DrawerProps, Stack } from "metabase/ui";

import Styles from "./sidesheet.module.css";

export type SidesheetSize = "xs" | "sm" | "md" | "lg" | "xl" | "auto";

interface SidesheetProps {
  title?: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  size?: SidesheetSize;
  children: React.ReactNode;
  /** use this if you want to enable interior scrolling of tab panels */
  removeBodyPadding?: boolean;
  withOverlay?: boolean;
}

const sizes: Record<SidesheetSize, string> = {
  xs: "20rem",
  sm: "30rem",
  md: "40rem",
  lg: "50rem",
  xl: "60rem",
  auto: "auto",
};

export function Sidesheet({
  title,
  isOpen,
  size = "sm",
  removeBodyPadding,
  children,
  withOverlay = true,
  ...drawerProps
}: SidesheetProps & Omit<DrawerProps, "opened">) {
  const titleId = useMemo(() => uniqueId("sidesheet-title"), []);

  return (
    <Drawer.Root position="right" opened={isOpen} h="100dvh" {...drawerProps}>
      {withOverlay && <Drawer.Overlay />}
      <Drawer.Content
        bg="bg-light"
        px="none"
        data-testid="sidesheet"
        classNames={{
          content: cx(Styles.SidesheetContent, Animation.slideLeft),
        }}
        aria-labelledby={titleId}
        w={sizes[size]}
      >
        <Drawer.Header bg="bg-light" px="xl">
          {title && (
            <Drawer.Title fz="xl" fw="bold" py="md" pr="sm" id={titleId}>
              {title}
            </Drawer.Title>
          )}
          <Drawer.CloseButton aria-label={t`Close`} />
        </Drawer.Header>
        <Drawer.Body
          p={0}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "1 1 auto",
            overflow: "hidden",
          }}
        >
          <Stack
            gap="lg"
            px={removeBodyPadding ? 0 : "xl"}
            pb={removeBodyPadding ? 0 : "xl"}
            mt={title ? "none" : "md"}
            h="100%"
            className={Styles.OverflowAuto}
          >
            {children}
          </Stack>
        </Drawer.Body>
      </Drawer.Content>
    </Drawer.Root>
  );
}
