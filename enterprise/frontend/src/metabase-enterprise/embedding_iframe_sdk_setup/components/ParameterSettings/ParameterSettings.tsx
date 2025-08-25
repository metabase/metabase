import { useDebouncedCallback } from "@mantine/hooks";
import { useCallback, useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { ParameterWidget } from "metabase/parameters/components/ParameterWidget";
import { Group, Stack, Text } from "metabase/ui";
import { SET_INITIAL_PARAMETER_DEBOUNCE_MS } from "metabase-enterprise/embedding_iframe_sdk_setup/constants";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";

import { useSdkIframeEmbedSetupContext } from "../../context";

import { ParameterVisibilityToggle } from "./ParameterVisibilityToggle";
import { useHideParameter } from "./hooks/use-hide-parameter";

function mapValuesBySlugToById(
  valuesBySlug: Record<string, any> | undefined,
  params: { id: string; slug: string }[],
) {
  if (!valuesBySlug) {
    return {};
  }

  return params.reduce<Record<string, any>>((byId, param) => {
    if (param.slug in valuesBySlug) {
      byId[param.id] = valuesBySlug[param.slug];
    }
    return byId;
  }, {});
}

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

  /**
   * Widgets (and most of metabase logic) expect parameter values keyed by
   * **parameter.id**, but in the embed flow settings we store them by
   * **parameter.slug**, as the public API of embeds wants them by slug
   *
   * Here we convert them to "by-id" to make widgets work properly.
   */
  const parameterValuesById = useMemo(() => {
    const valuesBySlug = match(settings)
      .with({ dashboardId: P.nonNullable }, (s) => s.initialParameters)
      .with({ questionId: P.nonNullable }, (s) => s.initialSqlParameters)
      .otherwise(() => ({}));

    return mapValuesBySlugToById(valuesBySlug, availableParameters);
  }, [settings, availableParameters]);

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

  if (availableParameters.length > 0) {
    return (
      <Stack>
        {uiParameters.map((parameter) => (
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
