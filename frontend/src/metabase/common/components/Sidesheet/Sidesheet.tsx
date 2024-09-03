import type React from "react";
import { t } from "ttag";

import { type MantineStyleSystemProps, Modal, Stack } from "metabase/ui";

import Styles from "./sidesheet.module.css";

type Size = "xs" | "sm" | "md" | "lg" | "xl" | "auto";

interface SidesheetProps {
  title?: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  size?: Size;
  children: React.ReactNode;
  /** use this if you want to enable interior scrolling of tab panels */
  removeBodyPadding?: boolean;
}

const sizes: Record<Size, string> = {
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
  onClose,
  size = "sm",
  children,
  removeBodyPadding,
  ...styleProps
}: SidesheetProps & Partial<MantineStyleSystemProps>) {
  return (
    <Modal.Root opened={isOpen} onClose={onClose} h="100dvh">
      <Modal.Overlay data-testid="modal-overlay" />
      <Modal.Content
        transitionProps={{ transition: "slide-left" }}
        px="none"
        w={sizes[size]}
        bg="bg-light"
        data-testid="sidesheet"
        className={Styles.SidesheetContent}
        data-testid="sidesheet"
      >
        <Modal.Header bg="bg-light" px="xl">
          {title && (
            <Modal.Title py="md" pr="sm">
              {title}
            </Modal.Title>
          )}
          <Modal.CloseButton aria-label={t`Close`} />
        </Modal.Header>
        <Modal.Body
          p={0}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "1 1 auto",
            overflow: "hidden",
          }}
        >
          <Stack
            spacing="lg"
            px={removeBodyPadding ? 0 : "xl"}
            pb={removeBodyPadding ? 0 : "xl"}
            mt={title ? "none" : "md"}
            h="100%"
            className={Styles.OverflowAuto}
            {...styleProps}
          >
            {children}
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
