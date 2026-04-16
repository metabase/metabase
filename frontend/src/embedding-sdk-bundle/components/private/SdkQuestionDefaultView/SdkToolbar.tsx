import type { CSSProperties, ReactNode } from "react";
import { forwardRef } from "react";

import { ResultToolbar } from "embedding-sdk-bundle/components/private/SdkQuestion/components/ResultToolbar/ResultToolbar";
import { Box, Group } from "metabase/ui";

import { RenderIfHasContent } from "../RenderIfHasContent/RenderIfHasContent";

import S from "./MobileToolbar.module.css";

type MobileSlotProps = {
  className: string;
  styles: Record<string, CSSProperties>;
};

type SdkToolbarProps = {
  isMobile: boolean;

  /** Primary left control (chart type selector or back button).
   *  On desktop: rendered in the left Group.
   *  On mobile: falls back to wrapping in LeftButton class. */
  left?: ReactNode;

  /** Mobile override for the left slot.
   *  Render prop receiving { className, styles } for LeftButton styling. */
  mobileLeft?: (props: MobileSlotProps) => ReactNode;

  /** Extra desktop-only controls (filters, summarize, breakout). Hidden on mobile. */
  desktopExtra?: ReactNode;

  /** Desktop right-aligned controls (download, alerts, editor). Hidden on mobile. */
  right?: ReactNode;

  /** Mobile right button. Render prop receiving { className, styles } for RightButton styling. */
  mobileRight?: (props: MobileSlotProps) => ReactNode;

  "data-testid"?: string;
};

const mobileLeftSlotProps: MobileSlotProps = {
  className: S.LeftButton,
  styles: {
    inner: { width: "100%" },
    label: { marginRight: "auto" },
  },
};

const mobileRightSlotProps: MobileSlotProps = {
  className: S.RightButton,
  styles: {},
};

export const SdkToolbar = forwardRef<HTMLDivElement, SdkToolbarProps>(
  function SdkToolbar(
    {
      isMobile,
      left,
      mobileLeft,
      desktopExtra,
      right,
      mobileRight,
      "data-testid": dataTestId,
    },
    ref,
  ) {
    if (isMobile) {
      return (
        <Box ref={ref} className={S.MobileToolbar} data-testid={dataTestId}>
          {mobileLeft ? mobileLeft(mobileLeftSlotProps) : left}
          {mobileRight?.(mobileRightSlotProps)}
        </Box>
      );
    }

    return (
      <ResultToolbar ref={ref} data-testid={dataTestId}>
        <RenderIfHasContent component={Group} gap="xs">
          {left}
          {desktopExtra}
        </RenderIfHasContent>
        <RenderIfHasContent component={Group} gap="sm" ml="auto">
          {right}
        </RenderIfHasContent>
      </ResultToolbar>
    );
  },
);
