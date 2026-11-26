import cx from "classnames";
import type { ReactNode } from "react";
import { type RevealSpec, instant, together } from "skullet";
import { SkulletProvider, Skeleton as SkulletSkeleton } from "skullet/react";
import { t } from "ttag";

import { Box } from "metabase/ui";

import S from "./MeasuredSkeleton.module.css";

// PROTOTYPE: compare switch. `?skeletons=classic` swaps every measured
// skeleton for the hand-drawn one it replaced, `?skeletons=measured` swaps
// back. The choice is remembered so it holds across in-app navigation.
const SKELETON_STYLE_PARAM = "skeletons";
const SKELETON_STYLE_STORAGE_KEY = "metabase-prototype-skeleton-style";

/** Whether `?skeletons=classic` asked for the hand-drawn skeletons. */
export function isClassicSkeletonStyle(): boolean {
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

// Skullet holds a skeleton back this long, so data that beats it never shows one
const SKELETON_DELAY = 150;

// Skullet's default ("smart") reveal, but whole rather than in sequence: at
// once after a fast load or mid-gesture, else one crossfade.
const CROSSFADE_REVEAL: RevealSpec = {
  hold: SKELETON_DELAY,
  choose: ({ input, waited }) =>
    input || waited < SKELETON_DELAY ? instant : together,
};

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
  /**
   * Crossfade the whole skeleton into the content at once, rather than
   * skullet's default of bringing the content in piece by piece, top to
   * bottom. A load faster than the skeleton's delay still shows at once.
   */
  crossfade?: boolean;
};

/**
 * A skeleton measured from the content it stands in for, drawn by skullet,
 * that crossfades into the content once it loads.
 */
export function MeasuredSkeleton({
  loading,
  id,
  alwaysFromSample = false,
  crossfade = false,
  classic,
  className,
  children,
}: MeasuredSkeletonProps) {
  if (isClassicSkeletonStyle()) {
    return <>{loading ? classic : children}</>;
  }

  const skeleton = (
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

  return crossfade ? (
    <SkulletProvider reveal={CROSSFADE_REVEAL}>{skeleton}</SkulletProvider>
  ) : (
    skeleton
  );
}
