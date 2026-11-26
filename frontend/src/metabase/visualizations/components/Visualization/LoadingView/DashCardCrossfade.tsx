import type { ReactNode } from "react";

import {
  MeasuredSkeleton,
  SkeletonSwap,
} from "metabase/common/components/Skeletons";

import S from "./DashCardCrossfade.module.css";

// Skullet paints an element with this attribute as is, rather than drawing a
// skeleton over it
const SKULLET_OWN = { "skullet-own": "" };

type DashCardCrossfadeProps = {
  /** Only dashboard cards are revealed whole; elsewhere they show as is. */
  enabled: boolean;
  loading: boolean;
  /** The card's title row, if it has one. */
  header: ReactNode;
  /** The chart-shaped skeleton the card shows while its query runs. */
  loadingView: ReactNode;
  /** Whatever the card shows once its query is done. */
  children: ReactNode;
};

/**
 * Reveals a dashboard card as one unit once its query is done and its chart
 * has drawn: until then its title is a skeleton bar measured from the real
 * title, over the chart-shaped loading view.
 */
export const DashCardCrossfade = ({
  enabled,
  loading,
  header,
  loadingView,
  children,
}: DashCardCrossfadeProps) => {
  if (!enabled) {
    return (
      <>
        {header}
        {children}
      </>
    );
  }

  return (
    <SkeletonSwap
      loading={loading}
      className={S.root}
      classic={
        <>
          {header}
          {loadingView}
        </>
      }
      skeleton={
        <MeasuredSkeleton
          loading
          alwaysFromSample
          className={S.skullet}
          classic={null}
        >
          {header}
          {/* Painted as is, in the shape of the card's chart */}
          <div {...SKULLET_OWN} className={S.chart}>
            {loadingView}
          </div>
        </MeasuredSkeleton>
      }
    >
      {header}
      {children}
    </SkeletonSwap>
  );
};
