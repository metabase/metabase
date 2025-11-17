import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { ParameterWidget } from "metabase/parameters/components/ParameterWidget";
import { Group, Stack, Text } from "metabase/ui";
import { SET_INITIAL_PARAMETER_DEBOUNCE_MS } from "metabase-enterprise/embedding_iframe_sdk_setup/constants";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterValueOrArray } from "metabase-types/api";

import { useSdkIframeEmbedSetupContext } from "../../context";

import { ParameterVisibilityToggle } from "./ParameterVisibilityToggle";
import { useHideParameter } from "./hooks/use-hide-parameter";

export const ParameterSettings = () => {
  const {
    experience,
    settings,
    updateSettings,
    availableParameters,
    parametersValuesById,
    isLoading,
  } = useSdkIframeEmbedSetupContext();

  const { isParameterHidden, toggleParameterVisibility } = useHideParameter({
    settings,
    updateSettings,
  });

  const isQuestionOrDashboardEmbed =
    !!settings.questionId || !!settings.dashboardId;

  const updateInitialParameterValue = useDebouncedCallback(
    useCallback(
      (slug: string, value: ParameterValueOrArray | null | undefined) => {
        if (settings.dashboardId) {
          updateSettings({
            initialParameters: {
              ...settings.initialParameters,
              [slug]: value,
            },
          });
        } else if (settings.questionId) {
          updateSettings({
            initialSqlParameters: {
              ...settings.initialSqlParameters,
              [slug]: value,
            },
          });
        }
      },
      [settings, updateSettings],
    ),
    SET_INITIAL_PARAMETER_DEBOUNCE_MS,
  );

  const uiParameters = useMemo(
    () =>
      getValuePopulatedParameters({
        parameters: availableParameters,
        values: parametersValuesById,
        defaultRequired: true,
      }),
    [availableParameters, parametersValuesById],
  );

  // Only show parameters for dashboards and questions
  if (!isQuestionOrDashboardEmbed) {
    return null;
  }

  if (isLoading) {
    return (
      <Text size="sm" c="text-secondary">
        {t`Loading parameters...`}
      </Text>
    );
  }

  if (availableParameters.length > 0) {
    return (
      <Stack>
        {uiParameters.map((parameter: UiParameter) => (
          <Group justify="space-between" align="center" key={parameter.id}>
            <ParameterWidget
              className={CS.m0}
              parameter={parameter}
              parameters={uiParameters}
              setValue={(value: string) =>
                updateInitialParameterValue(parameter.slug, value)
              }
              setParameterValueToDefault={() => {
                updateInitialParameterValue(parameter.slug, parameter.default);
              }}
              enableParameterRequiredBehavior
            />
            <ParameterVisibilityToggle
              parameterName={parameter.slug}
              experience={experience}
              isHidden={isParameterHidden(parameter.slug)}
              onToggle={toggleParameterVisibility}
            />
          </Group>
        ))}
      </Stack>
    );
  }

  return (
    <Text size="sm" c="text-disabled">
      {t`Parameters are not available for this ${experience}.`}
    </Text>
  );
};
