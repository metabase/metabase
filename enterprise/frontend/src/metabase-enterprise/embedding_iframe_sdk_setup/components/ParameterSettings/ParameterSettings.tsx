import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { c, t } from "ttag";

import { Stack, Text, TextInput } from "metabase/ui";
import { SET_INITIAL_PARAMETER_DEBOUNCE_MS } from "metabase-enterprise/embedding_iframe_sdk_setup/constants";

import { useSdkIframeEmbedSetupContext } from "../../context";

import { ParameterVisibilityToggle } from "./ParameterVisibilityToggle";
import { useHideParameter } from "./hooks/use-hide-parameter";
import { getParameterPlaceholder } from "./utils/parameter-placeholder";

export const ParameterSettings = () => {
  const {
    experience,
    settings,
    updateSettings,
    availableParameters,
    isLoadingParameters,
  } = useSdkIframeEmbedSetupContext();

  const { isParameterHidden, toggleParameterVisibility } = useHideParameter();

  const isQuestionOrDashboardEmbed =
    !!settings.questionId || !!settings.dashboardId;

  const updateInitialParameterValue = useDebouncedCallback(
    useCallback(
      (paramId: string, value: string) => {
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

  const parameterValues = useMemo(() => {
    if (settings.dashboardId) {
      return settings.initialParameters;
    } else if (settings.questionId) {
      return settings.initialSqlParameters;
    }

    return {};
  }, [settings]);

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

  if (availableParameters.length > 0) {
    return (
      <Stack>
        {availableParameters.map((param) => {
          const defaultValue = parameterValues?.[param.slug] ?? undefined;

          const placeholderValue = getParameterPlaceholder(param);

          const placeholderText = c(
            `the placeholder text containing examples of how a parameter string looks like. {0} contains the placeholder (e.g. "2025-11-05")`,
          ).t`e.g. ${placeholderValue}`;

          return (
            <TextInput
              key={param.id}
              label={param.name}
              placeholder={placeholderValue ? placeholderText : undefined}
              defaultValue={defaultValue}
              onChange={(e) =>
                updateInitialParameterValue(param.slug, e.target.value)
              }
              rightSection={
                <ParameterVisibilityToggle
                  parameterName={param.slug}
                  experience={experience}
                  isHidden={isParameterHidden(param.slug)}
                  onToggle={toggleParameterVisibility}
                />
              }
            />
          );
        })}
      </Stack>
    );
  }

  return (
    <Text size="sm" c="text-light">
      {t`Parameters are not available for this ${experience}.`}
    </Text>
  );
};
