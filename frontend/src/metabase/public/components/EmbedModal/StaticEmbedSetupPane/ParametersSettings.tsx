import { t } from "ttag";
import type { ChangeEvent, ReactNode } from "react";
import { useMemo } from "react";
import type { IconName } from "metabase/ui";
import { Box, Divider, Icon, Stack, Text } from "metabase/ui";
import Select, { Option } from "metabase/core/components/Select";
import { ParameterWidget as StaticParameterWidget } from "metabase/parameters/components/ParameterWidget";
import type {
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbeddingParametersValues,
  EmbedResourceParameter,
  EmbedResourceType,
} from "metabase/public/lib/types";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

import { PreviewModeSelector } from "./PreviewModeSelector";
import type {
  ActivePreviewPane,
  EmbedResourceParameterWithValue,
} from "./types";
import PreviewPane from "./PreviewPane";
import { SettingsTabLayout } from "./StaticEmbedSetupPane.styled";
import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";

export interface ParametersSettingsProps {
  activePane: ActivePreviewPane;

  resourceType: EmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  embeddingParams: EmbeddingParameters;
  lockedParameters: EmbedResourceParameter[];
  parameterValues: EmbeddingParametersValues;

  iframeUrl: string;
  displayOptions: EmbeddingDisplayOptions;
  serverEmbedCodeSlot: ReactNode;

  onChangeEmbeddingParameters: (parameters: EmbeddingParameters) => void;
  onChangeParameterValue: (id: string, value: string) => void;

  onChangePane: (pane: ActivePreviewPane) => void;
}

export const ParametersSettings = ({
  activePane,
  resourceType,
  resourceParameters,
  embeddingParams,
  lockedParameters,
  parameterValues,
  iframeUrl,
  displayOptions,
  serverEmbedCodeSlot,
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
              title={t`Configuring parameters`}
            >
              <Stack spacing="1rem">
                <Text>{t`Parameters are disabled by default, which also makes them hidden from end-users. Make them editable so that end-users can see and modify them. Make them locked so that they are hidden from end-users but you can set their values from your app.`}</Text>

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
                      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
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
                  title={t`Previewing locked parameters`}
                >
                  <Stack spacing="1rem">
                    <Text>{t`Try passing some sample values to your locked parameters here. Your server will have to provide the actual values in the signed token when doing this for real.`}</Text>

                    {valuePopulatedLockedParameters.map(parameter => (
                      <StaticParameterWidget
                        key={parameter.id}
                        className="m0"
                        parameter={parameter}
                        parameters={valuePopulatedLockedParameters}
                        setValue={(value: string) => {
                          onChangeParameterValue(parameter.id, value);
                        }}
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
            serverEmbedCodeSlot
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
