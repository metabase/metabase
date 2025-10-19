import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { ParameterWidget } from "metabase/parameters/components/ParameterWidget";
import { ParametersSettings } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/ParametersSettings";
import { getLockedPreviewParameters } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-locked-preview-parameters";
import { Group, Stack, Text } from "metabase/ui";
import { SET_INITIAL_PARAMETER_DEBOUNCE_MS } from "metabase-enterprise/embedding_iframe_sdk_setup/constants";
import { getResourceTypeFromExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-resource-type-from-experience";
import { getSdkIframeEmbedSettingsForEmbeddingParameters } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-sdk-iframe-embed-settings-for-embedding-parameters";
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
    embeddingParameters,
    isLoading,
  } = useSdkIframeEmbedSetupContext();

  const { isParameterHidden, toggleParameterVisibility } = useHideParameter({
    settings,
    updateSettings,
  });

  const isStaticEmbedding = !!settings.isStatic;
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
  const removeInitialParameterValue = useCallback(
    (slug: string) => {
      if (settings.dashboardId) {
        const nextInitialParameters = { ...settings.initialParameters };
        delete nextInitialParameters[slug];
        updateSettings({
          initialParameters: nextInitialParameters,
        });
      } else if (settings.questionId) {
        const nextInitialSqlParameters = { ...settings.initialSqlParameters };
        delete nextInitialSqlParameters[slug];
        updateSettings({
          initialSqlParameters: nextInitialSqlParameters,
        });
      }
    },
    [settings, updateSettings],
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
      <Text size="sm" c="text-medium">
        {t`Loading parameters...`}
      </Text>
    );
  }

  if (isStaticEmbedding) {
    const lockedParameters = getLockedPreviewParameters(
      availableParameters,
      embeddingParameters,
    );
    const resourceType = getResourceTypeFromExperience(experience);

    if (!resourceType) {
      return null;
    }

    return (
      <ParametersSettings
        resourceType={resourceType}
        resourceParameters={availableParameters}
        embeddingParams={embeddingParameters}
        lockedParameters={lockedParameters}
        parameterValues={parameterValuesById}
        withInitialValues
        onChangeEmbeddingParameters={(embeddingParameters) => {
          updateSettings(
            getSdkIframeEmbedSettingsForEmbeddingParameters(
              embeddingParameters,
            ),
          );
        }}
        onChangeParameterValue={({ slug, value }) =>
          updateInitialParameterValue(slug, value)
        }
        onRemoveParameterValue={({ slug }) => removeInitialParameterValue(slug)}
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
