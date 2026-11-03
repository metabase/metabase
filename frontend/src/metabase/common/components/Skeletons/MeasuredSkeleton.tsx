import type { ReactNode } from "react";
import { Skeleton as SkulletSkeleton } from "skullet/react";
import { t } from "ttag";

import { Box } from "metabase/ui";

import S from "./MeasuredSkeleton.module.css";

export type MeasuredSkeletonProps = {
  loading: boolean;
  /**
   * Remembers the shape of the content last shown under this key, across
   * visits, so later loads draw the real layout rather than the sample's.
   */
  id?: string;
  /**
   * The content. While loading, render it from realistic sample data: it's
   * laid out unseen and a skeleton is drawn over every line of text and block
   * in it, so it must render purely, without fetching or other side effects.
   */
  children: ReactNode;
};

/**
 * A skeleton measured from the content it stands in for, drawn by skullet,
 * that crossfades into the content once it loads.
 */
export function MeasuredSkeleton({
  loading,
  id,
  children,
}: MeasuredSkeletonProps) {
  return (
    <Box
      display="contents"
      data-testid={loading ? "loading-indicator" : undefined}
    >
      <SkulletSkeleton
        className={S.root}
        loading={loading}
        id={id}
        label={t`Loading...`}
      >
        {children}
      </SkulletSkeleton>
    </Box>
  );
}
