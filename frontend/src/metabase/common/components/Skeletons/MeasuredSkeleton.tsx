import cx from "classnames";
import type { ReactNode } from "react";
import { Skeleton as SkulletSkeleton } from "skullet/react";
import { t } from "ttag";

import { Box } from "metabase/ui";

import S from "./MeasuredSkeleton.module.css";

// PROTOTYPE: compare switch. `?skeletons=classic` swaps every measured
// skeleton for the hand-drawn one it replaced, `?skeletons=measured` swaps
// back. The choice is remembered so it holds across in-app navigation.
const SKELETON_STYLE_PARAM = "skeletons";
const SKELETON_STYLE_STORAGE_KEY = "metabase-prototype-skeleton-style";

function isClassicSkeletonStyle(): boolean {
  const style = new URLSearchParams(window.location.search).get(
    SKELETON_STYLE_PARAM,
  );
  try {
    if (style === "classic" || style === "measured") {
      window.localStorage.setItem(SKELETON_STYLE_STORAGE_KEY, style);
      return style === "classic";
    }
    return (
      window.localStorage.getItem(SKELETON_STYLE_STORAGE_KEY) === "classic"
    );
  } catch {
    return style === "classic";
  }
}

// Skullet measures the sample whenever it holds an [skullet-own] element, which
// it paints as is rather than drawing over; this one is never shown.
const SAMPLE_ONLY_MARKER = { "skullet-own": "", style: { display: "none" } };

export type MeasuredSkeletonProps = {
  loading: boolean;
  /**
   * Remembers the shape of the content last shown under this key, across
   * visits, so later loads draw the real layout rather than the sample's.
   */
  id?: string;
  /**
   * Always measure the sample, never a shape skullet remembers. Skullet
   * redraws a remembered shape from a copy of the content's markup, out of its
   * place on the page, which breaks for large pages with nested skeletons. To
   * draw such a page's real layout, render the sample from what it showed last.
   */
  alwaysFromSample?: boolean;
  /**
   * The hand-drawn skeleton this one replaced, shown instead under
   * `?skeletons=classic` to compare the two. Render its own `LoadingSkeleton`
   * root.
   */
  classic: ReactNode;
  /**
   * The content. While loading, render it from realistic sample data: it's
   * laid out unseen and a skeleton is drawn over every line of text and block
   * in it, so it must render purely, without fetching or other side effects.
   */
  children: ReactNode;
  /** For the wrapper skullet adds around the skeleton and the content. */
  className?: string;
};

/**
 * A skeleton measured from the content it stands in for, drawn by skullet,
 * that crossfades into the content once it loads.
 */
export function MeasuredSkeleton({
  loading,
  id,
  alwaysFromSample = false,
  classic,
  className,
  children,
}: MeasuredSkeletonProps) {
  if (isClassicSkeletonStyle()) {
    return <>{loading ? classic : children}</>;
  }

  return (
    <Box
      display="contents"
      data-testid={loading ? "loading-indicator" : undefined}
    >
      <SkulletSkeleton
        className={cx(S.root, className)}
        loading={loading}
        id={id}
        label={t`Loading...`}
      >
        {children}
        {loading && alwaysFromSample && <span {...SAMPLE_ONLY_MARKER} />}
      </SkulletSkeleton>
    </Box>
  );
}

export type CrossfadeSkeletonProps = {
  loading: boolean;
  /**
   * Drawn as is while loading, rather than measured from the content. Carries
   * its own `loading-indicator` test id and loading label, if any.
   */
  skeleton: ReactNode;
  /** For the wrapper skullet adds around the skeleton and the content. */
  className?: string;
  children: ReactNode;
};

/**
 * A hand-drawn skeleton that skullet crossfades into the content once it
 * loads, for content whose shape can't be measured ahead of time. Under
 * `?skeletons=classic` the skeleton is swapped for the content at once.
 */
export function CrossfadeSkeleton({
  loading,
  skeleton,
  className,
  children,
}: CrossfadeSkeletonProps) {
  if (isClassicSkeletonStyle()) {
    return <>{loading ? skeleton : children}</>;
  }

  return (
    <SkulletSkeleton
      className={cx(S.root, className)}
      loading={loading}
      skeleton={skeleton}
    >
      {children}
    </SkulletSkeleton>
  );
}
