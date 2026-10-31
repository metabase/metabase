import { useHotkeys } from "@mantine/hooks";
import cx from "classnames";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";
import { uniqueId } from "underscore";

import Animation from "metabase/css/core/animation.module.css";
import {
  Group,
  Modal,
  type ModalOverlayProps,
  NO_ANIMATION_MODAL_PROPS,
  Stack,
} from "metabase/ui";

import Styles from "./sidesheet.module.css";

export type SidesheetSize = "xs" | "sm" | "md" | "lg" | "xl" | "auto";

export type SidesheetTitleSize = "h3" | "h4";

export const SIDESHEET_HORIZONTAL_PADDING = "xl";

// Mantine's Drawer default; the enter animation is the CSS keyframe below.
const EXIT_TRANSITION_DURATION_MS = 250;

/**
 * Answers a user's attempt to close the Sidesheet. `false` keeps the sheet
 * open with everything in it; `true` lets the exit transition start.
 */
export type ConfirmSidesheetClose = () => boolean | Promise<boolean>;

const SidesheetCloseContext = createContext<(() => void) | null>(null);

/**
 * Closes the enclosing Sidesheet the way its close button does: `confirmClose`
 * is asked, the exit transition plays, then the Sidesheet's `onClose` is called.
 */
export const useSidesheetClose = () => {
  const close = useContext(SidesheetCloseContext);
  if (!close) {
    throw new Error("useSidesheetClose must be used inside a Sidesheet");
  }
  return close;
};

interface SidesheetProps {
  title?: React.ReactNode;
  titleSize?: SidesheetTitleSize;
  isOpen: boolean;
  /** Called once the exit transition has finished */
  onClose: () => void;
  /**
   * Asked before every user-initiated close (close button, Escape, overlay,
   * `closeHotkey`, `useSidesheetClose`). Nothing animates until it answers
   * `true`, so a consumer can keep its state and ask the user first.
   */
  confirmClose?: ConfirmSidesheetClose;
  /** a preset, or a width in pixels */
  size?: SidesheetSize | number;
  children: React.ReactNode;
  withOverlay?: boolean;
  overlayProps?: ModalOverlayProps;
  closeOnEscape?: boolean;
  /** Keyboard shortcut that closes the sheet the way its close button does */
  closeHotkey?: string;
  offset?: boolean;
  /** icon actions shown before the close button */
  actions?: React.ReactNode;
  /** pinned below the scrolling body */
  footer?: React.ReactNode;
}

const sizes: Record<SidesheetSize, string> = {
  xs: "20rem",
  sm: "30rem",
  md: "40rem",
  lg: "50rem",
  xl: "60rem",
  auto: "auto",
};

// Enter stays a CSS keyframe (immediate, so the sheet's content is in the
// DOM as soon as it opens); only the exit is a Mantine transition.
const transitionProps = {
  transition: "slide-left",
  duration: 0,
  exitDuration: EXIT_TRANSITION_DURATION_MS,
} as const;

export function Sidesheet({
  title,
  titleSize = "h4",
  isOpen,
  onClose,
  confirmClose,
  size = "sm",
  children,
  withOverlay = true,
  overlayProps,
  closeOnEscape = true,
  closeHotkey,
  offset,
  actions,
  footer,
}: SidesheetProps) {
  const titleId = useMemo(() => uniqueId("sidesheet-title"), []);

  // Consumers usually unmount the sheet in `onClose`, so play the exit
  // transition first and only then tell them.
  const [isClosing, setIsClosing] = useState(false);
  const requestClose = useCallback(async () => {
    if (!isOpen || isClosing) {
      return;
    }
    if (confirmClose && !(await confirmClose())) {
      return;
    }
    setIsClosing(true);
  }, [isOpen, isClosing, confirmClose]);
  const handleExitTransitionEnd = () => {
    if (isClosing) {
      setIsClosing(false);
      onClose();
    }
  };

  useHotkeys(closeHotkey ? [[closeHotkey, requestClose]] : []);

  return (
    <SidesheetCloseContext.Provider value={requestClose}>
      <Modal.Root
        variant="sidesheet"
        opened={isOpen && !isClosing}
        onClose={requestClose}
        onExitTransitionEnd={handleExitTransitionEnd}
        closeOnEscape={closeOnEscape}
        shadow="xs_outline"
        h="100dvh"
        transitionProps={transitionProps}
        // The theme's enter keyframes restart when the exit transition
        // starts, so the sheet would slide back in before it slides out.
        styles={isClosing ? NO_ANIMATION_MODAL_PROPS.styles : undefined}
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
              <Modal.Title pr="sm" id={titleId} fz={titleSize} lh={titleSize}>
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
          <Modal.Body p={0} className={Styles.SidesheetBody}>
            <Stack
              gap="xl"
              px={SIDESHEET_HORIZONTAL_PADDING}
              pb="xl"
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
