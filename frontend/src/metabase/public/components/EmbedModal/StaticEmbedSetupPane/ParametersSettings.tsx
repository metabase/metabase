import cx from "classnames";
import type { ChangeEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import Select, { Option } from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";
import { ParameterWidget as StaticParameterWidget } from "metabase/parameters/components/ParameterWidget";
import type {
  EmbeddingParameters,
  EmbeddingParametersValues,
  EmbeddingParameterVisibility,
  EmbedResourceParameter,
  EmbedResourceType,
} from "metabase/public/lib/types";
import type { IconName } from "metabase/ui";
import { Box, Divider, Icon, Stack, Text } from "metabase/ui";
import { getValuePopulatedParameters } from "metabase-lib/v1/parameters/utils/parameter-values";

import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";
import type { EmbedResourceParameterWithValue } from "./types";

export interface ParametersSettingsProps {
  resourceType: EmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  embeddingParams: EmbeddingParameters;
  lockedParameters: EmbedResourceParameter[];
  parameterValues: EmbeddingParametersValues;

  onChangeEmbeddingParameters: (parameters: EmbeddingParameters) => void;
  onChangeParameterValue: (id: string, value: string) => void;
}

export const ParametersSettings = ({
  resourceType,
  resourceParameters,
  embeddingParams,
  lockedParameters,
  parameterValues,
  onChangeEmbeddingParameters,
  onChangeParameterValue,
}: ParametersSettingsProps): JSX.Element => {
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
    param => param.required,
  );

  return resourceParameters.length > 0 ? (
    <>
      <StaticEmbedSetupPaneSettingsContentSection
        title={t`Configuring parameters`}
      >
        <Stack spacing="1rem">
          <Text>{t`Parameters are disabled by default, which also makes them hidden from end-users. Make them editable so that end-users can see and modify them. Make them locked so that they are hidden from end-users but you can set their values from your app.`}</Text>

          {resourceParameters.map(parameter => (
            <div key={parameter.id} className={cx(CS.flex, CS.alignCenter)}>
              <Icon name={getIconForParameter(parameter)} className={CS.mr2} />
              <h3>
                {parameter.name}
                {parameter.required && (
                  <Text color="error" span>
                    &nbsp;*
                  </Text>
                )}
              </h3>
              <Select
                buttonProps={{
                  "aria-label": parameter.name,
                }}
                className={cx(CS.mlAuto, CS.bgWhite)}
                value={embeddingParams[parameter.slug] || "disabled"}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  onChangeEmbeddingParameters({
                    ...embeddingParams,
                    [parameter.slug]: e.target
                      .value as EmbeddingParameterVisibility,
                  })
                }
              >
                <Option
                  icon="close"
                  value="disabled"
                  disabled={parameter.required}
                >{t`Disabled`}</Option>
                <Option icon="pencil" value="enabled">{t`Editable`}</Option>
                <Option icon="lock" value="locked">{t`Locked`}</Option>
              </Select>
            </div>
          ))}

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
            <Stack spacing="1rem">
              <Text>{t`Try passing some sample values to your locked parameters here. Your server will have to provide the actual values in the signed token when doing this for real.`}</Text>

              {valuePopulatedLockedParameters.map(parameter => (
                <StaticParameterWidget
                  key={parameter.id}
                  className={CS.m0}
                  parameter={parameter}
                  parameters={valuePopulatedLockedParameters}
                  setValue={(value: string) =>
                    onChangeParameterValue(parameter.id, value)
                  }
                  setParameterValueToDefault={() => {
                    onChangeParameterValue(
                      parameter.id,
                      parameter.default as any,
                    );
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

const getIconForParameter = (parameter: EmbedResourceParameter): IconName => {
  if (parameter.type === "category") {
    return "string";
  }

  if (parameter.type.indexOf("date/") === 0) {
    return "calendar";
  }

  return "unknown";
};
