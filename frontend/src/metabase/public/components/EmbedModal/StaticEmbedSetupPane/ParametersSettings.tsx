import { t } from "ttag";
import { useMemo } from "react";
import type { IconName } from "metabase/ui";
import { Icon, Box, Divider, Stack, Text } from "metabase/ui";
import Select, { Option } from "metabase/core/components/Select";

import { ParameterWidget as StaticParameterWidget } from "metabase/parameters/components/ParameterWidget";
import { PreviewModeSelector } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/PreviewModeSelector";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

import type {
  ActivePreviewPane,
  EmbedResourceParameter,
  EmbedResourceType,
  EmbeddingParameters,
  EmbeddingParametersValues,
  EmbeddingDisplayOptions,
  EmbedResource,
  EmbedModalStep,
  EmbedResourceParameterWithValue,
} from "../types";
import EmbedCodePane from "./EmbedCodePane";
import PreviewPane from "./PreviewPane";
import { SettingsTabLayout } from "./StaticEmbedSetupPane.styled";
import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";

export interface ParametersSettingsProps {
  activePane: ActivePreviewPane;

  resource: EmbedResource;
  resourceType: EmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  embeddingParams: EmbeddingParameters;
  lockedParameters: EmbedResourceParameter[];
  parameterValues: EmbeddingParametersValues;

  embedType: EmbedModalStep;

  iframeUrl: string;
  token: string;
  siteUrl: string;
  secretKey: string;
  params: EmbeddingParameters;
  displayOptions: EmbeddingDisplayOptions;

  onChangeEmbeddingParameters: (parameters: EmbeddingParameters) => void;
  onChangeParameterValue: (id: string, value: string) => void;

  onChangePane: (pane: ActivePreviewPane) => void;
}

export const ParametersSettings = ({
  activePane,
  resource,
  resourceType,
  resourceParameters,
  embeddingParams,
  lockedParameters,
  parameterValues,
  displayOptions,
  embedType,
  iframeUrl,
  token,
  siteUrl,
  secretKey,
  params,
  onChangeEmbeddingParameters,
  onChangeParameterValue,
  onChangePane,
}: ParametersSettingsProps): JSX.Element => {
  const valuePopulatedLockedParameters = useMemo(
    () =>
      getValuePopulatedParameters(
        lockedParameters,
        parameterValues,
      ) as EmbedResourceParameterWithValue[],
    [lockedParameters, parameterValues],
  );

  return (
    <SettingsTabLayout
      settingsSlot={
        resourceParameters.length > 0 ? (
          <>
            <StaticEmbedSetupPaneSettingsContentSection
              title={t`Enable or lock parameters`}
            >
              <Stack spacing="1rem">
                <Text>{t`Enabling a parameter lets viewers interact with it. Locking one lets you pass it a value from your app while hiding it from viewers.`}</Text>

                {resourceParameters.map(parameter => (
                  <div key={parameter.id} className="flex align-center">
                    <Icon
                      name={getIconForParameter(parameter)}
                      className="mr2"
                    />
                    <h3>{parameter.name}</h3>
                    <Select
                      buttonProps={{
                        "aria-label": parameter.name,
                      }}
                      className="ml-auto bg-white"
                      value={embeddingParams[parameter.slug] || "disabled"}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        onChangeEmbeddingParameters({
                          ...embeddingParams,
                          [parameter.slug]: e.target.value,
                        })
                      }
                    >
                      <Option
                        icon="close"
                        value="disabled"
                      >{t`Disabled`}</Option>
                      <Option
                        icon="pencil"
                        value="enabled"
                      >{t`Editable`}</Option>
                      <Option icon="lock" value="locked">{t`Locked`}</Option>
                    </Select>
                  </div>
                ))}
              </Stack>
            </StaticEmbedSetupPaneSettingsContentSection>

            {lockedParameters.length > 0 && (
              <>
                <Divider my="2rem" />
                <StaticEmbedSetupPaneSettingsContentSection
                  title={t`Preview locked parameters`}
                >
                  <Stack spacing="1rem">
                    <Text>{t`Try passing some sample values to your locked parameters here. Your server will have to provide the actual values in the signed token when doing this for real.`}</Text>

                    {valuePopulatedLockedParameters.map(parameter => (
                      <StaticParameterWidget
                        key={parameter.id}
                        className="m0"
                        parameter={parameter}
                        parameters={valuePopulatedLockedParameters}
                        setValue={(value: string) =>
                          onChangeParameterValue(parameter.id, value)
                        }
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
        )
      }
      previewSlot={
        <>
          <PreviewModeSelector value={activePane} onChange={onChangePane} />

          {activePane === "preview" ? (
            <PreviewPane
              className="flex-full"
              previewUrl={iframeUrl}
              isTransparent={displayOptions.theme === "transparent"}
            />
          ) : activePane === "code" ? (
            <EmbedCodePane
              className="flex-full w-full"
              embedType={embedType}
              resource={resource}
              resourceType={resourceType}
              iframeUrl={iframeUrl}
              token={token}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={params}
              displayOptions={displayOptions}
            />
          ) : null}
        </>
      }
    />
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
