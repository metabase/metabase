import cx from "classnames";
import type { ChangeEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { Option, Select } from "metabase/common/components/Select";
import CS from "metabase/css/core/index.css";
import { ParameterWidget as StaticParameterWidget } from "metabase/parameters/components/ParameterWidget";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import type {
  EmbedResourceParameter,
  EmbedResourceType,
  EmbeddingParameterVisibility,
  EmbeddingParameters,
  EmbeddingParametersValues,
} from "metabase/public/lib/types";
import { Box, Divider, Icon, Stack, Text } from "metabase/ui";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";

import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";
import type { EmbedResourceParameterWithValue } from "./types";

export interface ParametersSettingsProps {
  resourceType: EmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  withInitialValues: boolean;

  embeddingParams: EmbeddingParameters;
  lockedParameters: EmbedResourceParameter[];
  parameterValues: EmbeddingParametersValues;

  onChangeEmbeddingParameters: (parameters: EmbeddingParameters) => void;
  onChangeParameterValue: (data: {
    id: string;
    slug: string;
    value: string | null;
  }) => void;
  onRemoveParameterValue: (data: { id: string; slug: string }) => void;
}

export const ParametersSettings = ({
  resourceType,
  resourceParameters,
  withInitialValues,
  embeddingParams,
  lockedParameters,
  parameterValues,
  onChangeEmbeddingParameters,
  onChangeParameterValue,
  onRemoveParameterValue,
}: ParametersSettingsProps): JSX.Element => {
  const valuePopulatedEditableParameters = useMemo(
    () =>
      getValuePopulatedParameters({
        parameters: resourceParameters,
        values: parameterValues,
        defaultRequired: true,
      }).filter((parameter) => {
        const visibility = embeddingParams[parameter.slug] || "disabled";
        return visibility === "enabled";
      }) as EmbedResourceParameterWithValue[],
    [resourceParameters, parameterValues, embeddingParams],
  );
  const valuePopulatedLockedParameters = useMemo(
    () =>
      getValuePopulatedParameters({
        parameters: lockedParameters,
        values: parameterValues,
        defaultRequired: true,
      }) as EmbedResourceParameterWithValue[],
    [lockedParameters, parameterValues],
  );

  const hasRequiredParameters = resourceParameters.some(
    (param) => param.required,
  );

  return resourceParameters.length > 0 ? (
    <>
      <StaticEmbedSetupPaneSettingsContentSection
        title={t`Configuring parameters`}
      >
        <Stack gap="1rem">
          <Text>{t`Parameters are disabled by default, which also makes them hidden from end-users. Make them editable so that end-users can see and modify them. Make them locked so that they are hidden from end-users but you can set their values from your app.`}</Text>

          {resourceParameters.map((parameter) => {
            const visibility = embeddingParams[parameter.slug] || "disabled";

            return (
              <div key={parameter.id} className={cx(CS.flex, CS.alignCenter)}>
                <Icon
                  name={getParameterIconName(parameter)}
                  className={CS.mr2}
                />
                <h3>
                  {parameter.name}
                  {parameter.required && (
                    <Text color="error" component="span">
                      &nbsp;*
                    </Text>
                  )}
                </h3>
                <Select
                  buttonProps={{
                    "aria-label": parameter.name,
                  }}
                  className={cx(CS.mlAuto, CS.bgWhite)}
                  value={visibility}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    const nextVisibility = e.target
                      .value as EmbeddingParameterVisibility;

                    onChangeEmbeddingParameters({
                      ...embeddingParams,
                      [parameter.slug]: nextVisibility,
                    });

                    if (nextVisibility === "disabled") {
                      onRemoveParameterValue({
                        id: parameter.id,
                        slug: parameter.slug,
                      });
                    }
                  }}
                >
                  <Option
                    icon="close"
                    value="disabled"
                    disabled={parameter.required}
                  >{t`Disabled`}</Option>
                  <Option icon="lock" value="locked">{t`Locked`}</Option>
                  <Option icon="pencil" value="enabled">{t`Editable`}</Option>
                </Select>
              </div>
            );
          })}

          {hasRequiredParameters && (
            <Text size="xm">
              <strong>{t`Note`}: </strong>
              {t`Parameters marked with a red asterisk are required and can't be disabled.`}
            </Text>
          )}
        </Stack>
      </StaticEmbedSetupPaneSettingsContentSection>

      {lockedParameters.length > 0 && (
        <>
          <Divider my="2rem" />
          <StaticEmbedSetupPaneSettingsContentSection
            title={t`Previewing locked parameters`}
          >
            <Stack gap="1rem">
              <Text>{t`Try passing some sample values to your locked parameters here. Your server will have to provide the actual values in the signed token when doing this for real.`}</Text>

              {valuePopulatedLockedParameters.map((parameter) => (
                <StaticParameterWidget
                  key={parameter.id}
                  className={CS.m0}
                  parameter={parameter}
                  parameters={valuePopulatedLockedParameters}
                  setValue={(value: string) =>
                    onChangeParameterValue({
                      id: parameter.id,
                      slug: parameter.slug,
                      value,
                    })
                  }
                  setParameterValueToDefault={() => {
                    onChangeParameterValue({
                      id: parameter.id,
                      slug: parameter.slug,
                      value: parameter.default as any,
                    });
                  }}
                  enableParameterRequiredBehavior
                />
              ))}
            </Stack>
          </StaticEmbedSetupPaneSettingsContentSection>
        </>
      )}

      {withInitialValues && valuePopulatedEditableParameters.length > 0 && (
        <>
          <Divider my="2rem" />
          <StaticEmbedSetupPaneSettingsContentSection
            title={t`Set initial values for parameters`}
          >
            <Stack gap="1rem">
              {valuePopulatedEditableParameters.map((parameter) => (
                <StaticParameterWidget
                  key={parameter.id}
                  className={CS.m0}
                  parameter={parameter}
                  parameters={valuePopulatedEditableParameters}
                  setValue={(value: string) => {
                    if (value) {
                      onChangeParameterValue({
                        id: parameter.id,
                        slug: parameter.slug,
                        value,
                      });
                    } else {
                      onRemoveParameterValue({
                        id: parameter.id,
                        slug: parameter.slug,
                      });
                    }
                  }}
                  setParameterValueToDefault={() => {
                    onChangeParameterValue({
                      id: parameter.id,
                      slug: parameter.slug,
                      value: parameter.default as any,
                    });
                  }}
                  enableParameterRequiredBehavior
                />
              ))}
            </Stack>
          </StaticEmbedSetupPaneSettingsContentSection>
        </>
      )}
    </>
  ) : (
    <>
      <Box mb="2rem">
        <Text>{t`This ${resourceType} doesn't have any parameters to configure yet.`}</Text>
      </Box>
      <Divider />
    </>
  );
};
