import { useMemo } from "react";
import { P, match } from "ts-pattern";

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
            `dashboard-${JSON.stringify(settings.initialParameters)}`,
        )
        .with(
          { questionId: P.nonNullable },
          (settings) =>
            `question-${JSON.stringify(settings.initialSqlParameters)}`,
        )
        .otherwise(() => null),
    [settings],
  );
