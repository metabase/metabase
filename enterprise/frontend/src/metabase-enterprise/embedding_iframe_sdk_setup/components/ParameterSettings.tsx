import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { Stack, Text, TextInput } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";
import { useHideParameter } from "../hooks";

import { ParameterVisibilityToggle } from "./ParameterVisibilityToggle";

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
        if ("initialParameters" in settings) {
          updateSettings({
            initialParameters: {
              ...settings.initialParameters,
              [paramId]: value,
            },
          });
        } else if ("initialSqlParameters" in settings) {
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
    500,
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

  if (availableParameters.length > 0) {
    return (
      <Stack>
        {availableParameters.map((param) => {
          const placeholder = match(param.default)
            .with(P.array(), (arr) => arr.join(", "))
            .with(P.nullish, () => `Default ${param.name.toLowerCase()}`)
            .otherwise((val) => val.toString());

          return (
            <TextInput
              key={param.id}
              label={param.name}
              placeholder={placeholder}
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
