import type React from "react";
import type { HTMLAttributes } from "react";
import { t } from "ttag";

import { Modal, Stack } from "metabase/ui";

import Styles from "./sidesheet.module.css";

type Size = "xs" | "sm" | "md" | "lg" | "xl" | "auto";

export interface SidesheetProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
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
  ...modalRootProps
}: SidesheetProps) {
  return (
    <Modal.Root
      opened={isOpen}
      onClose={onClose}
      h="100dvh"
      {...modalRootProps}
    >
      <Modal.Overlay data-testid="modal-overlay" />
      <Modal.Content
        transitionProps={{ transition: "slide-left" }}
        px="none"
        w={sizes[size]}
        bg="bg-light"
        data-testid="sidesheet"
        className={Styles.SidesheetContent}
      >
        <Modal.Header bg="bg-light" pt="md">
          {title && (
            <Modal.Title py="md" pr="sm">
              {title}
            </Modal.Title>
          )}
          <Modal.CloseButton
            c="var(--mb-color-text-black)"
            aria-label={t`Close`}
          />
        </Modal.Header>
        <Modal.Body p={0} className={Styles.ModalBody}>
          <Stack
            spacing="lg"
            px={removeBodyPadding ? 0 : "xl"}
            pb={removeBodyPadding ? 0 : "xl"}
            mt={title ? "none" : "md"}
            h="100%"
            className={Styles.OverflowAuto}
          >
            {children}
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
