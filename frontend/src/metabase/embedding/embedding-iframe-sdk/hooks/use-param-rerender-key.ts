import { useMemo } from "react";
import { P, match } from "ts-pattern";

import { stableStringify } from "metabase/lib/objects";

import type { SdkIframeEmbedSettings } from "../types/embed";

/**
 * Forces a re-render when the initial parameter changes.
 */
export const useParamRerenderKey = (settings: SdkIframeEmbedSettings) =>
  useMemo(() => {
    const { entity, dependencies } = match(settings)
      .with({ componentName: "metabase-dashboard" }, (settings) => ({
        entity: "dashboard",
        dependencies: {
          initialParameters: settings.initialParameters,
          hiddenParameters: settings.hiddenParameters,
          token: settings.token,
        },
      }))
      .with(
        { componentName: "metabase-question", questionId: P.nonNullable },
        { componentName: "metabase-question", token: P.nonNullable },
        (settings) => ({
          entity: "question",
          dependencies: {
            initialParameters: settings.initialSqlParameters,
            hiddenParameters: settings.hiddenParameters,
            token: settings.token,
          },
        }),
      )
      .otherwise(() => ({ entity: "entity", dependencies: {} }));

    return `${entity}-${stableStringify({
      isGuest: settings.isGuest,
      ...dependencies,
    })}`;
  }, [settings]);
