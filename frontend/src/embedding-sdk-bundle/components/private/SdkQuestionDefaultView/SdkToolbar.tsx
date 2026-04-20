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

type SdkToolbarProps = {
  isMobile: boolean;

  /** Left control (chart type selector, back button).
   *  `desktop`: rendered in the left Group.
   *  `mobile`: render prop receiving { className, styles } for LeftButton styling. */
  left?: ResponsiveSlot | null;

  /** Extra desktop-only controls (filters, summarize, breakout). Hidden on mobile. */
  desktopExtra?: ReactNode;

  /** Right controls (editor, download, alerts).
   *  `desktop`: rendered in a right-aligned Group.
   *  `mobile`: render prop receiving { className } for RightButton styling. */
  right?: ResponsiveSlot;

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

export const SdkToolbar = forwardRef<HTMLDivElement, SdkToolbarProps>(
  function SdkToolbar(
    { isMobile, left, desktopExtra, right, "data-testid": dataTestId },
    ref,
  ) {
    if (isMobile) {
      return (
        <Box ref={ref} className={S.MobileToolbar} data-testid={dataTestId}>
          {left?.mobile?.(mobileLeftProps)}
          {right?.mobile?.(mobileRightProps)}
        </Box>
      );
    }

    return (
      <ResultToolbar ref={ref} data-testid={dataTestId}>
        <RenderIfHasContent component={Group} gap="xs">
          {left?.desktop}
          {desktopExtra}
        </RenderIfHasContent>
        <RenderIfHasContent component={Group} gap="sm" ml="auto">
          {right?.desktop}
        </RenderIfHasContent>
      </ResultToolbar>
    );
  },
);
