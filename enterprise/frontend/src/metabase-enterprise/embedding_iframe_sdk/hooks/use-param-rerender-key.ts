import { useMemo } from "react";
import { P, match } from "ts-pattern";

import { sortObject } from "metabase-lib/v1/utils";

import type { SdkIframeEmbedSettings } from "../../embedding_iframe_sdk/types/embed";

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

// Stringify with sorted keys to ensure stable orders.
const stableStringify = <T>(obj: T): string => JSON.stringify(sortObject(obj));
