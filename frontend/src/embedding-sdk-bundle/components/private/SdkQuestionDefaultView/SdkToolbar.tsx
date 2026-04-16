import type { CSSProperties, ReactNode } from "react";
import { forwardRef } from "react";

import { ResultToolbar } from "embedding-sdk-bundle/components/private/SdkQuestion/components/ResultToolbar/ResultToolbar";
import { Box, Group } from "metabase/ui";

import { RenderIfHasContent } from "../RenderIfHasContent/RenderIfHasContent";

import S from "./SdkToolbar.module.css";

/** Props passed to mobile render props for button styling. */
export type MobileSlotProps = {
  className: string;
  styles: Record<string, CSSProperties>;
};

/** A slot that renders differently on desktop vs mobile. */
export type ResponsiveSlot = {
  desktop?: ReactNode;
  mobile?: (props: MobileSlotProps) => ReactNode;
};

/**
 * Slot content can be:
 * - A `{ desktop, mobile }` object when content differs significantly between layouts.
 * - A render function `(mobile: MobileSlotProps | null) => ReactNode` when content
 *   is the same component with different props — receives `null` on desktop,
 *   `{ className, styles }` on mobile.
 */
export type SlotProp =
  | ResponsiveSlot
  | ((mobile: MobileSlotProps | null) => ReactNode)
  | null;

type SdkToolbarProps = {
  isMobile: boolean;

  /** Left control (chart type selector, back button). */
  left?: SlotProp;

  /** Extra desktop-only controls (filters, summarize, breakout). Hidden on mobile. */
  desktopExtra?: ReactNode;

  /** Right controls (editor, download, alerts). */
  right?: SlotProp;

  "data-testid"?: string;
};

const mobileLeftProps: MobileSlotProps = {
  className: S.LeftButton,
  styles: {
    inner: { width: "100%" },
    label: { marginRight: "auto" },
  },
};

const mobileRightProps: MobileSlotProps = {
  className: S.RightButton,
  styles: {},
};

function resolveSlot(
  slot: SlotProp | undefined,
  isMobile: boolean,
  mobileProps: MobileSlotProps,
): ReactNode {
  if (!slot) {
    return null;
  }

  if (typeof slot === "function") {
    return slot(isMobile ? mobileProps : null);
  }

  return isMobile ? slot.mobile?.(mobileProps) : slot.desktop;
}

export const SdkToolbar = forwardRef<HTMLDivElement, SdkToolbarProps>(
  function SdkToolbar(
    { isMobile, left, desktopExtra, right, "data-testid": dataTestId },
    ref,
  ) {
    if (isMobile) {
      return (
        <Box ref={ref} className={S.MobileToolbar} data-testid={dataTestId}>
          {resolveSlot(left, true, mobileLeftProps)}
          {resolveSlot(right, true, mobileRightProps)}
        </Box>
      );
    }

    return (
      <ResultToolbar ref={ref} data-testid={dataTestId}>
        <RenderIfHasContent component={Group} gap="xs">
          {resolveSlot(left, false, mobileLeftProps)}
          {desktopExtra}
        </RenderIfHasContent>
        <RenderIfHasContent component={Group} gap="sm" ml="auto">
          {resolveSlot(right, false, mobileRightProps)}
        </RenderIfHasContent>
      </ResultToolbar>
    );
  },
);
