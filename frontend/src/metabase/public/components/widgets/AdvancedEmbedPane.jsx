/* @flow */

import React from "react";

import ToggleLarge from "metabase/components/ToggleLarge";
import Button from "metabase/components/Button";
import ActionButton from "metabase/components/ActionButton";
import { t } from "c-3po";
import AdvancedSettingsPane from "./AdvancedSettingsPane";
import PreviewPane from "./PreviewPane";
import EmbedCodePane from "./EmbedCodePane";

import type { Parameter, ParameterId } from "metabase/meta/types/Parameter";
import type { Pane, EmbedType, DisplayOptions } from "./EmbedModalContent";
import type {
  EmbeddableResource,
  EmbeddingParams,
} from "metabase/public/lib/types";

import _ from "underscore";

type Props = {
  className?: string,

  pane: Pane,
  embedType: EmbedType,

  resourceType: string,
  resource: EmbeddableResource,
  resourceParameters: Parameter[],

  token: string,
  iframeUrl: string,
  siteUrl: string,
  secretKey: string,
  params: { [slug: string]: any },

  displayOptions: DisplayOptions,
  previewParameters: Parameter[],
  parameterValues: { [id: ParameterId]: any },
  embeddingParams: EmbeddingParams,

  onChangeDisplayOptions: DisplayOptions => void,
  onChangeEmbeddingParameters: EmbeddingParams => void,
  onChangeParameterValue: (id: ParameterId, value: any) => void,
  onChangePane: (pane: Pane) => void,
  onSave: () => Promise<void>,
  onUnpublish: () => Promise<void>,
  onDiscard: () => void,
};

const AdvancedEmbedPane = ({
  pane,
  resource,
  resourceType,
  embedType,
  token,
  iframeUrl,
  siteUrl,
  secretKey,
  params,
  displayOptions,
  previewParameters,
  parameterValues,
  resourceParameters,
  embeddingParams,
  onChangeDisplayOptions,
  onChangeEmbeddingParameters,
  onChangeParameterValue,
  onChangePane,
  onSave,
  onUnpublish,
  onDiscard,
}: Props) => (
  <div className="full flex">
    <div className="flex-full p4 flex flex-column">
      {!resource.enable_embedding ||
      !_.isEqual(resource.embedding_params, embeddingParams) ? (
        <div className="mb2 p2 bordered rounded flex align-center flex-no-shrink">
          <div className="flex-full mr1">
            {resource.enable_embedding
              ? t`You’ve made changes that need to be published before they will be reflected in your application embed.`
              : t`You will need to publish this ${resourceType} before you can embed it in another application.`}
          </div>
          <div className="flex-no-shrink">
            {resource.enable_embedding &&
            !_.isEqual(resource.embedding_params, embeddingParams) ? (
              <Button
                className="ml1"
                medium
                onClick={onDiscard}
              >{t`Discard Changes`}</Button>
            ) : null}
            <ActionButton
              className="ml1"
              primary
              medium
              actionFn={onSave}
              activeText={t`Updating...`}
              successText={t`Updated`}
              failedText={t`Failed!`}
            >{t`Publish`}</ActionButton>
          </div>
        </div>
      ) : null}
      <ToggleLarge
        className="mb2 flex-no-shrink"
        style={{ width: 244, height: 34 }}
        value={pane === "preview"}
        textLeft={t`Preview`}
        textRight={t`Code`}
        onChange={() => onChangePane(pane === "preview" ? "code" : "preview")}
      />
      {pane === "preview" ? (
        <PreviewPane className="flex-full" previewUrl={iframeUrl} />
      ) : pane === "code" ? (
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
    </div>
    <AdvancedSettingsPane
      pane={pane}
      embedType={embedType}
      onChangePane={onChangePane}
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      embeddingParams={embeddingParams}
      onChangeEmbeddingParameters={onChangeEmbeddingParameters}
      displayOptions={displayOptions}
      onChangeDisplayOptions={onChangeDisplayOptions}
      previewParameters={previewParameters}
      parameterValues={parameterValues}
      onChangeParameterValue={onChangeParameterValue}
      onUnpublish={onUnpublish}
    />
  </div>
);

export default AdvancedEmbedPane;
