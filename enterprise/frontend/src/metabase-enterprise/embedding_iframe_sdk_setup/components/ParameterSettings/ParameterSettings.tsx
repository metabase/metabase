import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { ParameterWidget } from "metabase/parameters/components/ParameterWidget";
import { ParametersSettings } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/ParametersSettings";
import { getLockedPreviewParameters } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-locked-preview-parameters";
import { Group, Stack, Text } from "metabase/ui";
import { useParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-parameters";
import { useStaticEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/components/ParameterSettings/hooks/use-static-embedding-paramers";
import { SET_INITIAL_PARAMETER_DEBOUNCE_MS } from "metabase-enterprise/embedding_iframe_sdk_setup/constants";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterValueOrArray } from "metabase-types/api";

import { useSdkIframeEmbedSetupContext } from "../../context";

import { ParameterVisibilityToggle } from "./ParameterVisibilityToggle";
import { useHideParameter } from "./hooks/use-hide-parameter";

export const ParameterSettings = () => {
  const {
    embeddingType,
    experience,
    settings,
    updateSettings,
    availableParameters,
    isLoadingParameters,
  } = useSdkIframeEmbedSetupContext();

  const { getParameterValuesById } = useParameters();
  const { isParameterHidden, toggleParameterVisibility } = useHideParameter();
  const { buildEmbeddedParameters, setEmbeddingParameters } =
    useStaticEmbeddingParameters();

  const isStaticEmbedding = embeddingType === "static";
  const isQuestionOrDashboardEmbed =
    !!settings.questionId || !!settings.dashboardId;

  const updateInitialParameterValue = useDebouncedCallback(
    useCallback(
      (paramId: string, value: ParameterValueOrArray | null | undefined) => {
        if (settings.dashboardId) {
          updateSettings({
            initialParameters: {
              ...settings.initialParameters,
              [paramId]: value,
            },
          });
        } else if (settings.questionId) {
          updateSettings({
            initialSqlParameters: {
              ...settings.initialSqlParameters,
              [paramId]: value,
            },
          });
        }
      },
      [settings, updateSettings],
    ),
    SET_INITIAL_PARAMETER_DEBOUNCE_MS,
  );

  const parameterValuesById = getParameterValuesById();

  const uiParameters = useMemo(
    () =>
      getValuePopulatedParameters({
        parameters: availableParameters,
        values: parameterValuesById,
        defaultRequired: true,
      }),
    [availableParameters, parameterValuesById],
  );

  // Only show parameters for dashboards and questions
  if (!isQuestionOrDashboardEmbed) {
    return null;
  }

  if (isLoadingParameters) {
    return (
      <Text size="sm" c="text-medium">
        {t`Loading parameters...`}
      </Text>
    );
  }

  if (isStaticEmbedding) {
    const embeddingParams = buildEmbeddedParameters(availableParameters);
    const lockedParameters = getLockedPreviewParameters(
      availableParameters,
      embeddingParams,
    );

    return (
      <ParametersSettings
        resourceType={settings.dashboardId ? "dashboard" : "question"}
        resourceParameters={availableParameters}
        embeddingParams={embeddingParams}
        lockedParameters={lockedParameters}
        parameterValues={parameterValuesById}
        allowEditable={!!settings.dashboardId}
        onChangeEmbeddingParameters={setEmbeddingParameters}
        onChangeParameterValue={({ slug, value }) =>
          updateInitialParameterValue(slug, value)
        }
      />
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
    <Text size="sm" c="text-light">
      {t`Parameters are not available for this ${experience}.`}
    </Text>
  );
};
