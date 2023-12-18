import { t } from "ttag";
import { useMemo } from "react";
import ToggleLarge from "metabase/components/ToggleLarge";
import PreviewPane from "metabase/public/components/widgets/PreviewPane";
import EmbedCodePane from "metabase/public/components/widgets/EmbedCodePane";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";
import Select, { Option } from "metabase/core/components/Select";
import ParametersList from "metabase/parameters/components/ParametersList";
import { getValuePopulatedParameters } from "metabase-lib/parameters/utils/parameter-values";

import { EmbeddingModalContentSection } from "./EmbeddingModalContentSection";
import type {
  ActivePreviewPane,
  EmbedResourceParameter,
  EmbedResourceType,
  EmbeddingParameters,
  EmbeddingParametersValues,
  EmbeddingDisplayOptions,
  EmbedResource,
  EmbedType,
} from "./EmbeddingModalContent.types";
import { SettingsTabLayout } from "./EmbeddingModalContent.styled";

interface EmbeddingModalContentParametersSettingsProps {
  activePane: ActivePreviewPane;

  resource: EmbedResource;
  resourceType: EmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  embeddingParams: EmbeddingParameters;
  previewParameters: EmbedResourceParameter[];
  parameterValues: EmbeddingParametersValues;

  embedType: EmbedType;

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

export const EmbeddingModalContentParametersSettings = ({
  activePane,
  resource,
  resourceType,
  resourceParameters,
  embeddingParams,
  previewParameters,
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
}: EmbeddingModalContentParametersSettingsProps): JSX.Element => {
  const valuePopulatedParameters = useMemo(
    () => getValuePopulatedParameters(previewParameters, parameterValues),
    [previewParameters, parameterValues],
  );

  return (
    <SettingsTabLayout
      settingsSlot={
        <>
          <EmbeddingModalContentSection title={t`Enable or lock parameters`}>
            {resourceParameters.length > 0 ? (
              <p>{t`Enabling a parameter lets viewers interact with it. Locking one lets you pass it a value from your app while hiding it from viewers.`}</p>
            ) : (
              <p>{t`This ${resourceType} doesn't have any parameters to configure yet.`}</p>
            )}
            {resourceParameters.map(parameter => (
              <div key={parameter.id} className="flex align-center my1">
                <Icon
                  name={getIconForParameter(parameter)}
                  className="mr2"
                  style={{ color: color("text-light") }}
                />
                <h3>{parameter.name}</h3>
                <Select
                  buttonProps={{
                    "aria-label": parameter.name,
                  }}
                  className="ml-auto bg-white"
                  value={embeddingParams[parameter.slug] || "disabled"}
                  onChange={e =>
                    onChangeEmbeddingParameters({
                      ...embeddingParams,
                      [parameter.slug]: e.target.value,
                    })
                  }
                >
                  <Option icon="close" value="disabled">{t`Disabled`}</Option>
                  <Option icon="pencil" value="enabled">{t`Editable`}</Option>
                  <Option icon="lock" value="locked">{t`Locked`}</Option>
                </Select>
              </div>
            ))}
          </EmbeddingModalContentSection>

          {previewParameters.length > 0 && (
            <EmbeddingModalContentSection title={t`Preview Locked Parameters`}>
              <p>{t`Try passing some sample values to your locked parameters here. Your server will have to provide the actual values in the signed token when doing this for real.`}</p>
              <ParametersList
                className="mt2"
                vertical
                parameters={valuePopulatedParameters}
                setParameterValue={onChangeParameterValue}
              />
            </EmbeddingModalContentSection>
          )}
        </>
      }
      previewSlot={
        <>
          <ToggleLarge
            className="mb2 flex-no-shrink"
            style={{ width: 244, height: 34 }}
            value={activePane === "code"}
            textLeft={t`Code`}
            textRight={t`Preview`}
            onChange={() =>
              onChangePane(activePane === "preview" ? "code" : "preview")
            }
          />
          {activePane === "preview" ? (
            <PreviewPane
              className="flex-full"
              previewUrl={iframeUrl}
              isTransparent={displayOptions.theme === "transparent"}
            />
          ) : activePane === "code" ? (
            <EmbedCodePane
              className="flex-full"
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

const getIconForParameter = (parameter: EmbedResourceParameter) =>
  parameter.type === "category"
    ? "string"
    : parameter.type.indexOf("date/") === 0
    ? "calendar"
    : "unknown";
