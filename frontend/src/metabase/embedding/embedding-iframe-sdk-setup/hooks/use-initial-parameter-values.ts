import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useMemo } from "react";

import { SET_INITIAL_PARAMETER_DEBOUNCE_MS } from "metabase/embedding/embedding-iframe-sdk-setup/constants";
import type { SdkIframeEmbedSetupContextType } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import type { ParameterValueOrArray } from "metabase-types/api";

type ParameterValuesKey = "initialParameters" | "initialSqlParameters";

export const useInitialParameterValues = ({
  settings,
  updateSettings,
}: Pick<SdkIframeEmbedSetupContextType, "settings" | "updateSettings">) => {
  const parameterValuesKey: ParameterValuesKey | null = useMemo(() => {
    if (settings.dashboardId) {
      return "initialParameters";
    }

    if (settings.questionId) {
      return "initialSqlParameters";
    }

    return null;
  }, [settings.dashboardId, settings.questionId]);

  const currentParameterValues = useMemo((): ParameterValues => {
    if (parameterValuesKey === "initialParameters") {
      return (
        ("initialParameters" in settings
          ? settings.initialParameters
          : undefined) || {}
      );
    }

    if (parameterValuesKey === "initialSqlParameters") {
      return (
        ("initialSqlParameters" in settings
          ? settings.initialSqlParameters
          : undefined) || {}
      );
    }

    return {};
  }, [parameterValuesKey, settings]);

  const updateInitialParameterValue = useDebouncedCallback(
    useCallback(
      (slug: string, value: ParameterValueOrArray | null | undefined) => {
        if (parameterValuesKey === "initialParameters") {
          updateSettings({
            initialParameters: {
              ...currentParameterValues,
              [slug]: value,
            },
          });
        } else if (parameterValuesKey === "initialSqlParameters") {
          updateSettings({
            initialSqlParameters: {
              ...currentParameterValues,
              [slug]: value,
            },
          });
        }
      },
      [parameterValuesKey, currentParameterValues, updateSettings],
    ),
    SET_INITIAL_PARAMETER_DEBOUNCE_MS,
  );

  const removeInitialParameterValue = useCallback(
    (slug: string) => {
      const nextParameterValues = { ...currentParameterValues };
      delete nextParameterValues[slug];

      if (parameterValuesKey === "initialParameters") {
        updateSettings({
          initialParameters: nextParameterValues,
        });
      } else if (parameterValuesKey === "initialSqlParameters") {
        updateSettings({
          initialSqlParameters: nextParameterValues,
        });
      }
    },
    [parameterValuesKey, currentParameterValues, updateSettings],
  );

  return {
    updateInitialParameterValue,
    removeInitialParameterValue,
  };
};
