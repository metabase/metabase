import { useMemo } from "react";
import { P, match } from "ts-pattern";

import { stableStringify } from "metabase/lib/objects";

import type { SdkIframeEmbedSettings } from "../types/embed";

/**
 * Forces a re-render when the initial parameter changes.
 */
export const useParamRerenderKey = (settings: SdkIframeEmbedSettings) =>
  useMemo(
    () =>
      match(settings)
        .with(
          { dashboardId: P.nonNullable },
          (settings) =>
            `dashboard-${stableStringify(settings.initialParameters)}`,
        )
        .with(
          { questionId: P.nonNullable },
          (settings) =>
            `question-${stableStringify(settings.initialSqlParameters)}`,
        )
        .otherwise(() => null),
    [settings],
  );
