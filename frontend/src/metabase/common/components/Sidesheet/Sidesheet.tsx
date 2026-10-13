import cx from "classnames";
import type React from "react";
import { useMemo } from "react";
import { t } from "ttag";
import { uniqueId } from "underscore";

import Animation from "metabase/css/core/animation.module.css";
import { Modal, type ModalOverlayProps, Stack } from "metabase/ui";

import Styles from "./sidesheet.module.css";

export type SidesheetSize = "xs" | "sm" | "md" | "lg" | "xl" | "auto";

export const SIDESHEET_HORIZONTAL_PADDING = "xl";

interface SidesheetProps {
  title?: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  size?: SidesheetSize;
  children: React.ReactNode;
  /** use this if you want to enable interior scrolling of tab panels */
  removeBodyPadding?: boolean;
  withOverlay?: boolean;
  overlayProps?: ModalOverlayProps;
  closeOnEscape?: boolean;
  offset?: boolean;
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
  onClose,
  size = "sm",
  children,
  removeBodyPadding,
  withOverlay = true,
  overlayProps,
  closeOnEscape = true,
  offset,
}: SidesheetProps) {
  const titleId = useMemo(() => uniqueId("sidesheet-title"), []);
  return (
    <Modal.Root
      variant="sidesheet"
      opened={isOpen}
      onClose={onClose}
      closeOnEscape={closeOnEscape}
      shadow="xs_outline"
      h="100dvh"
    >
      {withOverlay && (
        <Modal.Overlay
          bg="overlay"
          {...overlayProps}
          data-testid="modal-overlay"
        />
      )}
      <Modal.Content
        transitionProps={{ duration: 0 }}
        px={0}
        w={sizes[size]}
        pos="fixed"
        bd={0}
        display="flex"
        flex={1}
        bg="background_surface-primary"
        data-testid="sidesheet"
        data-offset={offset || undefined}
        classNames={{
          content: cx(Styles.SidesheetContent, Animation.slideLeft),
        }}
        aria-labelledby={titleId}
      >
        <Modal.Header
          className={Styles.SidesheetHeader}
          bg="background_surface-primary"
          px={SIDESHEET_HORIZONTAL_PADDING}
          pt="xl"
          pb="lg"
        >
          {title && (
            <Modal.Title pr="sm" id={titleId} fz="h4" lh="h4">
              {title}
            </Modal.Title>
          )}
          <Modal.CloseButton
            aria-label={t`Close`}
            w="2rem"
            h="2rem"
            bdrs="xs"
            className={Styles.SidesheetCloseButton}
          />
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
            gap="xl"
            px={removeBodyPadding ? 0 : SIDESHEET_HORIZONTAL_PADDING}
            pb={removeBodyPadding ? 0 : "xl"}
            mt={title ? 0 : "lg"}
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
