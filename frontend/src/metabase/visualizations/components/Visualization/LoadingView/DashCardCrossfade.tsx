import type { ReactNode } from "react";

import { CrossfadeSkeleton } from "metabase/common/components/Skeletons";

import S from "./DashCardCrossfade.module.css";

type DashCardCrossfadeProps = {
  /** Only dashboard cards crossfade; elsewhere the children are shown as is. */
  enabled: boolean;
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
};

/**
 * Crossfades a dashboard card from its chart-shaped loading skeleton into
 * whatever it shows once its query is done: the chart, an error, or no results.
 */
export const DashCardCrossfade = ({
  enabled,
  loading,
  skeleton,
  children,
}: DashCardCrossfadeProps) =>
  enabled ? (
    <CrossfadeSkeleton className={S.root} loading={loading} skeleton={skeleton}>
      {children}
    </CrossfadeSkeleton>
  ) : (
    <>{children}</>
  );
