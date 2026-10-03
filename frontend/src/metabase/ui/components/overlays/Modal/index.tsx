import {
  Box,
  type BoxProps,
  type ElementProps,
  Modal as MantineModal,
  type ModalProps as MantineModalProps,
  type ModalRootProps as MantineModalRootProps,
} from "@mantine/core";
import cx from "classnames";
import type { ReactNode } from "react";

import { PreventEagerPortal } from "metabase/ui";
import { useGatedCloseProps } from "metabase/ui/components/overlays/overlay-stack";
import { useDisableCommandPalette } from "metabase/ui/hooks/use-disable-command-palette";

import S from "./Modal.module.css";

export { useModalsStack } from "@mantine/core";

export * from "./Modal.config";
export * from "./constants";

export const MODAL_LAYOUTS = ["default", "centered"] as const;

export type ModalLayout = (typeof MODAL_LAYOUTS)[number];

interface ModalLayoutProps {
  /**
   * How the modal's contents are arranged. `default` left-aligns the title
   * and body and right-aligns the footer buttons. `centered` centre-aligns
   * everything, stacks the footer buttons, and puts the title (and any
   * `illustration`) at the top of the body.
   */
  layout?: ModalLayout;
}

export interface ModalProps extends MantineModalProps, ModalLayoutProps {
  /** Rendered above the title. Only used by the `centered` layout. */
  illustration?: ReactNode;
}

export interface ModalRootProps
  extends MantineModalRootProps, ModalLayoutProps {}

export function Modal({
  layout = "default",
  illustration,
  title,
  children,
  ...props
}: ModalProps) {
  const closeProps = useGatedCloseProps(props);
  const isCentered = layout === "centered";
  const hasCenteredHeading = isCentered && (illustration != null || !!title);

  useDisableCommandPalette({
    disabled: props.opened,
  });

  return (
    <PreventEagerPortal {...props}>
      <MantineModal
        {...props}
        data-layout={layout}
        title={isCentered ? undefined : title}
        closeOnClickOutside={closeProps.closeOnClickOutside}
        closeOnEscape={closeProps.closeOnEscape}
      >
        {hasCenteredHeading && (
          <div className={S.centeredHeading}>
            {illustration}
            {title && <MantineModal.Title>{title}</MantineModal.Title>}
          </div>
        )}
        {children}
      </MantineModal>
    </PreventEagerPortal>
  );
}

function ModalRoot({ layout = "default", ...props }: ModalRootProps) {
  const closeProps = useGatedCloseProps(props);

  useDisableCommandPalette({
    disabled: props.opened,
  });
  return (
    <PreventEagerPortal>
      <MantineModal.Root
        {...props}
        data-layout={layout}
        closeOnClickOutside={closeProps.closeOnClickOutside}
        closeOnEscape={closeProps.closeOnEscape}
      />
    </PreventEagerPortal>
  );
}

export interface ModalFooterProps extends BoxProps, ElementProps<"div"> {}

/** The modal's action buttons. Place it last inside the modal body. */
function ModalFooter({ className, ...props }: ModalFooterProps) {
  return <Box className={cx(S.footer, className)} {...props} />;
}

Modal.Root = ModalRoot;
Modal.Overlay = MantineModal.Overlay;
Modal.Content = MantineModal.Content;
Modal.CloseButton = MantineModal.CloseButton;
Modal.Header = MantineModal.Header;
Modal.Title = MantineModal.Title;
Modal.Body = MantineModal.Body;
Modal.Footer = ModalFooter;
// Modal.NativeScrollArea = MantineModal.NativeScrollArea;
