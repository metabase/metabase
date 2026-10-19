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

import { InModalProvider } from "./InModalContext";
import S from "./Modal.module.css";

export { useModalsStack } from "@mantine/core";

export * from "./Modal.config";
export * from "./constants";
export * from "./InModalContext";

export const MODAL_LAYOUTS = ["default", "centered"] as const;

export type ModalLayout = (typeof MODAL_LAYOUTS)[number];

export const MODAL_DENSITIES = ["default", "relaxed"] as const;

export type ModalDensity = (typeof MODAL_DENSITIES)[number];

// Spacing comes from the theme, `layout` and `density`, so call sites can't
// override it. `padding` is re-added as `0` only, in `ModalLayoutProps`.
type ForbiddenMantineModalProps =
  | "m"
  | "mx"
  | "my"
  | "mt"
  | "mb"
  | "ml"
  | "mr"
  | "ms"
  | "me"
  | "p"
  | "px"
  | "py"
  | "pt"
  | "pb"
  | "pl"
  | "pr"
  | "ps"
  | "pe"
  | "padding";

interface ModalLayoutProps {
  /**
   * How the modal's contents are arranged. `default` left-aligns the title
   * and body and right-aligns the footer buttons. `centered` centre-aligns
   * everything, stacks the footer buttons, and puts the title (and any
   * `illustration`) at the top of the body.
   */
  layout?: ModalLayout;
  /**
   * Space between the header, body and footer. `default` is 16px. `relaxed`
   * is 24px, for bodies with several fields or sections, such as forms.
   */
  density?: ModalDensity;
  /**
   * Pass `0` for a full-bleed modal that lays out its own contents. Leave it
   * out to get the standard modal padding.
   */
  padding?: 0;
}

export interface ModalProps
  extends
    Omit<MantineModalProps, ForbiddenMantineModalProps>,
    ModalLayoutProps {
  /** Rendered above the title. Only used by the `centered` layout. */
  illustration?: ReactNode;
}

/**
 * The props that change from step to step when a multi-step modal reuses
 * one `Modal`, so moving between steps doesn't remount it.
 */
export type ModalStepProps = Pick<
  ModalProps,
  "layout" | "title" | "illustration"
>;

export interface ModalRootProps
  extends
    Omit<MantineModalRootProps, ForbiddenMantineModalProps>,
    ModalLayoutProps {}

export function Modal({
  layout = "default",
  density = "default",
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
        data-density={density}
        title={isCentered ? undefined : title}
        closeOnClickOutside={closeProps.closeOnClickOutside}
        closeOnEscape={closeProps.closeOnEscape}
      >
        <InModalProvider value={true}>
          {hasCenteredHeading && (
            <div className={S.centeredHeading}>
              {illustration}
              {title && <MantineModal.Title>{title}</MantineModal.Title>}
            </div>
          )}
          {children}
        </InModalProvider>
      </MantineModal>
    </PreventEagerPortal>
  );
}

function ModalRoot({
  layout = "default",
  density = "default",
  children,
  ...props
}: ModalRootProps) {
  const closeProps = useGatedCloseProps(props);

  useDisableCommandPalette({
    disabled: props.opened,
  });
  return (
    <PreventEagerPortal>
      <MantineModal.Root
        {...props}
        data-layout={layout}
        data-density={density}
        closeOnClickOutside={closeProps.closeOnClickOutside}
        closeOnEscape={closeProps.closeOnEscape}
      >
        <InModalProvider value={true}>{children}</InModalProvider>
      </MantineModal.Root>
    </PreventEagerPortal>
  );
}

export interface ModalFooterProps extends BoxProps, ElementProps<"div"> {}

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
