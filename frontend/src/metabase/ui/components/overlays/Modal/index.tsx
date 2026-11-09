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
import { t } from "ttag";

import {
  Group,
  Icon,
  PreventEagerPortal,
  Stack,
  UnstyledButton,
} from "metabase/ui";
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
  /**
   * Shows a Back button before the title, and makes clicking the title go
   * back too. Escape, the close button and clicking outside still close the
   * modal. Not supported by the `centered` layout.
   */
  onBack?: () => void;
  /**
   * Controls shown before the close button, such as an icon button. Not
   * supported by the `centered` layout.
   */
  headerActions?: ReactNode;
}

/**
 * The props that change from step to step when a multi-step modal reuses
 * one `Modal`, so moving between steps doesn't remount it.
 */
export type ModalStepProps = Pick<
  ModalProps,
  "layout" | "title" | "illustration" | "onBack" | "headerActions"
>;

export interface ModalRootProps
  extends
    Omit<MantineModalRootProps, ForbiddenMantineModalProps>,
    ModalLayoutProps {}

// Modals close instantly unless a call site sets its own `exitDuration`, as
// side sheets do.
function withInstantExit(transitionProps: ModalProps["transitionProps"]) {
  // Mantine's default, restated because a call site's `transitionProps` replace it
  const DEFAULT_TRANSITION_PROPS = {
    duration: 200,
    transition: "fade-down",
  } satisfies ModalProps["transitionProps"];

  return { ...DEFAULT_TRANSITION_PROPS, exitDuration: 0, ...transitionProps };
}

export function Modal({
  layout = "default",
  density = "default",
  illustration,
  title,
  onBack,
  headerActions,
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
      <ModalFromParts
        {...props}
        data-layout={layout}
        data-density={density}
        title={isCentered ? undefined : title}
        onBack={isCentered ? undefined : onBack}
        headerActions={isCentered ? undefined : headerActions}
        transitionProps={withInstantExit(props.transitionProps)}
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
      </ModalFromParts>
    </PreventEagerPortal>
  );
}

type ModalFromPartsProps = MantineModalProps &
  Pick<ModalProps, "onBack" | "headerActions">;

// Mantine's `Modal` only puts the title and the close button in its header,
// so this builds the same modal from the `Root` parts. Every modal renders
// through here, so adding or removing `onBack` or `headerActions` between
// steps only changes the header, and the body stays mounted
function ModalFromParts({
  title,
  onBack,
  headerActions,
  withOverlay = true,
  overlayProps,
  withCloseButton = true,
  closeButtonProps,
  radius,
  children,
  ...props
}: ModalFromPartsProps) {
  const hasHeader = !!title || withCloseButton || !!onBack || !!headerActions;
  const closeButton = withCloseButton && (
    <MantineModal.CloseButton {...closeButtonProps} />
  );

  return (
    <MantineModal.Root {...props} radius={radius}>
      {withOverlay && <MantineModal.Overlay {...overlayProps} />}
      <MantineModal.Content radius={radius}>
        {hasHeader && (
          <MantineModal.Header>
            {onBack ? (
              <ModalHeading onBack={onBack}>{title}</ModalHeading>
            ) : (
              title && <MantineModal.Title>{title}</MantineModal.Title>
            )}
            {headerActions ? (
              <Group gap="sm" wrap="nowrap" ms="auto">
                {headerActions}
                {closeButton}
              </Group>
            ) : (
              closeButton
            )}
          </MantineModal.Header>
        )}
        <MantineModal.Body>{children}</MantineModal.Body>
      </MantineModal.Content>
    </MantineModal.Root>
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
        transitionProps={withInstantExit(props.transitionProps)}
        closeOnClickOutside={closeProps.closeOnClickOutside}
        closeOnEscape={closeProps.closeOnEscape}
      >
        <InModalProvider value={true}>{children}</InModalProvider>
      </MantineModal.Root>
    </PreventEagerPortal>
  );
}

export interface ModalHeadingProps {
  /** The title, which is also the modal's accessible name. */
  children?: ReactNode;
  /**
   * Shows a Back button before the title, and makes clicking the title go
   * back too.
   */
  onBack?: () => void;
  /** Shown under the title, and left out of the modal's accessible name. */
  subtitle?: ReactNode;
}

/**
 * The title side of the header, as `Modal` renders it for `onBack`, for custom
 * headers built from `Modal.Root`. Put it in `Modal.Header` before any header
 * actions and `Modal.CloseButton`.
 */
function ModalHeading({ children, onBack, subtitle }: ModalHeadingProps) {
  const title = children && (
    <MantineModal.Title onClick={onBack}>{children}</MantineModal.Title>
  );

  return (
    <Group gap="sm" wrap="nowrap" align="flex-start" flex="1 1 auto" miw={0}>
      {onBack && <ModalBackButton onClick={onBack} />}
      {subtitle ? (
        <Stack gap="xs" flex="1 1 auto" miw={0}>
          {title}
          {subtitle}
        </Stack>
      ) : (
        title
      )}
    </Group>
  );
}

function ModalBackButton({ onClick }: { onClick: () => void }) {
  return (
    <UnstyledButton
      className={S.backButton}
      aria-label={t`Back`}
      onClick={onClick}
    >
      <Icon name="chevronleft" />
    </UnstyledButton>
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
Modal.Heading = ModalHeading;
Modal.Title = MantineModal.Title;
Modal.Body = MantineModal.Body;
Modal.Footer = ModalFooter;
// Modal.NativeScrollArea = MantineModal.NativeScrollArea;
