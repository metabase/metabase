import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";
import { uniqueId } from "underscore";

import { Group, Modal, type ModalOverlayProps, Stack } from "metabase/ui";

import Styles from "./sidesheet.module.css";

export type SidesheetSize = "xs" | "sm" | "md" | "lg" | "xl" | "auto";

export const SIDESHEET_HORIZONTAL_PADDING = "xl";

const SidesheetCloseContext = createContext<(() => void) | null>(null);

/** Closes the enclosing Sidesheet like its close button does: the exit
 * transition plays, then `onClose` is called. */
export const useSidesheetClose = () => {
  const close = useContext(SidesheetCloseContext);
  if (!close) {
    throw new Error("useSidesheetClose must be used inside a Sidesheet");
  }
  return close;
};

interface SidesheetProps {
  title?: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  /** a preset, or a width in pixels */
  size?: SidesheetSize | number;
  children: React.ReactNode;
  /** use this if you want to enable interior scrolling of tab panels */
  removeBodyPadding?: boolean;
  withOverlay?: boolean;
  overlayProps?: ModalOverlayProps;
  closeOnEscape?: boolean;
  offset?: boolean;
  /** pinned below the scrolling body */
  footer?: React.ReactNode;
  /** icon actions shown before the close button */
  actions?: React.ReactNode;
}

const sizes: Record<SidesheetSize, string> = {
  xs: "20rem",
  sm: "30rem",
  md: "40rem",
  lg: "50rem",
  xl: "60rem",
  auto: "auto",
};

// Mantine's Drawer defaults for `position="right"`: the content slides in
// with `slide-left` (250ms, Transition default) and the overlay fades (200ms).
const transitionProps = { transition: "slide-left" } as const;

// The theme gives every modal CSS keyframe animations, which override the
// inline styles Mantine's Transition applies.
const noThemeAnimationStyles = {
  overlay: { animation: "none" },
  content: { animation: "none" },
  inner: { animation: "none" },
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
  footer,
  actions,
}: SidesheetProps) {
  const titleId = useMemo(() => uniqueId("sidesheet-title"), []);

  // Mantine's Portal renders its children one commit after it mounts, which
  // is the same commit in which consumers flip `isOpen` on mount. The
  // Transition would then start out open and skip the enter animation, so
  // wait a frame until it has rendered closed.
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Consumers usually unmount the sheet in `onClose`, so play the exit
  // transition first and only then tell them.
  const [isClosing, setIsClosing] = useState(false);
  const close = useCallback(() => setIsClosing(true), []);
  const handleExitTransitionEnd = () => {
    if (isClosing) {
      setIsClosing(false);
      onClose();
    }
  };

  return (
    <SidesheetCloseContext.Provider value={close}>
      <Modal.Root
        variant="sidesheet"
        opened={isOpen && isReady && !isClosing}
        onClose={close}
        onExitTransitionEnd={handleExitTransitionEnd}
        closeOnEscape={closeOnEscape}
        shadow="xs_outline"
        h="100dvh"
        transitionProps={transitionProps}
        styles={noThemeAnimationStyles}
      >
        {withOverlay && (
          <Modal.Overlay
            bg="modal-overlay"
            {...overlayProps}
            data-testid="modal-overlay"
          />
        )}
        <Modal.Content
          px={0}
          w={typeof size === "number" ? size : sizes[size]}
          pos="fixed"
          bd={0}
          display="flex"
          flex={1}
          bg="background_surface-primary"
          data-testid="sidesheet"
          data-offset={offset || undefined}
          classNames={{ content: Styles.SidesheetContent }}
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
            <Group gap="xs" ml="auto" wrap="nowrap">
              {actions}
              <Modal.CloseButton
                aria-label={t`Close`}
                w="2rem"
                h="2rem"
                bdrs="xs"
                className={Styles.SidesheetCloseButton}
              />
            </Group>
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
              flex="1 1 0"
              mih={0}
              className={Styles.OverflowAuto}
            >
              {children}
            </Stack>
            {footer}
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </SidesheetCloseContext.Provider>
  );
}
