import { useMemo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { getResourceTypeFromExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-resource-type-from-experience";
import { isQuestionOrDashboardSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-question-or-dashboard-settings";
import { ParameterWidget } from "metabase/parameters/components/ParameterWidget";
import { ParametersSettings } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/ParametersSettings";
import { getLockedPreviewParameters } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-locked-preview-parameters";
import { Group, Stack, Text } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";

import { useSdkIframeEmbedSetupContext } from "../../context";
import { useInitialParameterValues } from "../../hooks/use-initial-parameter-values";
import { useParameterVisibility } from "../../hooks/use-parameter-visibility";

import { ParameterVisibilityToggle } from "./ParameterVisibilityToggle";

export const ParameterSettings = () => {
  const {
    experience,
    settings,
    updateSettings,
    availableParameters,
    parametersValuesById,
    embeddingParameters,
    isLoading,
    onEmbeddingParametersChange,
  } = useSdkIframeEmbedSetupContext();

  const { isHiddenParameter, toggleParameterVisibility } =
    useParameterVisibility({
      settings,
      updateSettings,
    });

  const { updateInitialParameterValue, removeInitialParameterValue } =
    useInitialParameterValues({
      settings,
      updateSettings,
    });

  const isGuestEmbed = !!settings.isGuest;
  const isQuestionOrDashboardEmbed = isQuestionOrDashboardSettings(
    experience,
    settings,
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

  if (isGuestEmbed) {
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
        parameterValues={parametersValuesById}
        withInitialValues
        onChangeEmbeddingParameters={onEmbeddingParametersChange}
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
              isHidden={isHiddenParameter(parameter.slug)}
              onToggle={toggleParameterVisibility}
            />
          </Group>
        ))}
      </Stack>
    );
  }

  return (
    <Text size="sm" c="text-tertiary">
      {t`Parameters are not available for this ${experience}.`}
    </Text>
  );
};
