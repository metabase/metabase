import { useState } from "react";
import { titleize } from "inflection";
import { t } from "ttag";

import _ from "underscore";
import { Icon } from "metabase/core/components/Icon";

import { getSignedPreviewUrl, getSignedToken } from "metabase/public/lib/embed";
import { color } from "metabase/lib/colors";

import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { useSelector } from "metabase/lib/redux";
import type {
  EmbeddingParameters,
  EmbeddingParametersValues,
  EmbedResource,
  EmbedResourceParameter,
  EmbedResourceType,
  EmbedType,
} from "metabase/public/components/widgets/types";
import AdvancedEmbedPane from "./AdvancedEmbedPane";
import SharingPane from "./SharingPane";
import { EmbedTitleLabel } from "./EmbedModalContent.styled";

export interface EmbedModalContentProps {
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  onUpdateEnableEmbedding: (enableEmbedding: boolean) => void;
  onUpdateEmbeddingParams: (embeddingParams: EmbeddingParameters) => void;

  extensions?: string[];
  onCreatePublicLink: () => void;
  onDisablePublicLink: () => void;
  getPublicUrl: (resource: EmbedResource, extension?: string | null) => string;

  onClose: () => void;

  className?: string;
}

export const EmbedModalContent = (
  props: EmbedModalContentProps,
): JSX.Element => {
  const {
    resource,
    resourceType,
    resourceParameters,
    extensions,
    onUpdateEnableEmbedding,
    onUpdateEmbeddingParams,
    onCreatePublicLink,
    onDisablePublicLink,
    getPublicUrl,
    onClose,
  } = props;

  const [pane, setPane] = useState<"preview">("preview");

  const isAdmin = useSelector(getUserIsAdmin);
  const siteUrl = useSelector(state => getSetting(state, "site-url"));
  const secretKey = useSelector(state =>
    getSetting(state, "embedding-secret-key"),
  );
  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );
  const isApplicationEmbeddingEnabled = useSelector(state =>
    getSetting(state, "enable-embedding"),
  );

  const [embeddingParams, setEmbeddingParams] = useState<EmbeddingParameters>(
    getDefaultEmbeddingParams(resource, resourceParameters),
  );
  const [embedType, setEmbedType] = useState<EmbedType>(null);
  const [parameterValues, setParameterValues] =
    useState<EmbeddingParametersValues>({});
  const [displayOptions, setDisplayOptions] = useState({
    font: null,
    theme: null,
    bordered: true,
    titled: true,
  });

  const handleSave = async () => {
    try {
      if (embedType === "application") {
        if (!resource.enable_embedding) {
          await onUpdateEnableEmbedding(true);
        }
        await onUpdateEmbeddingParams(embeddingParams);
      } else {
        if (!resource.public_uuid) {
          await onCreatePublicLink();
        }
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleUnpublish = async () => {
    await onUpdateEnableEmbedding(false);
  };

  const handleDiscard = () => {
    setEmbeddingParams(getDefaultEmbeddingParams(resource, resourceParameters));
  };

  const getPreviewParamsBySlug = () => {
    const lockedParameters = getPreviewParameters(
      resourceParameters,
      embeddingParams,
    );

    return Object.fromEntries(
      lockedParameters.map(parameter => [
        parameter.slug,
        parameterValues[parameter.id] ?? null,
      ]),
    );
  };

  const previewParametersBySlug = getPreviewParamsBySlug();
  const previewParameters = getPreviewParameters(
    resourceParameters,
    embeddingParams,
  );

  const embedTypeTitle = embedType && titleize(embedType);

  return (
    <div className="flex flex-column full-height">
      <div
        className="px2 py1 z1 flex align-center"
        style={{
          boxShadow:
            embedType === "application"
              ? `0px 8px 15px -9px ${color("text-dark")}`
              : undefined,
        }}
      >
        <h2 className="ml-auto">
          <a className="flex align-center" onClick={() => setEmbedType(null)}>
            <EmbedTitleLabel>{t`Sharing`}</EmbedTitleLabel>
            {embedTypeTitle && (
              <Icon name="chevronright" className="mx1 text-medium" />
            )}
            {embedTypeTitle}
          </a>
        </h2>
        <Icon
          className="text-light text-medium-hover cursor-pointer p2 ml-auto"
          name="close"
          size={24}
          onClick={() => {
            MetabaseAnalytics.trackStructEvent("Sharing Modal", "Modal Closed");
            onClose();
          }}
        />
      </div>
      {embedType == null ? (
        <div className="flex-full">
          <div className="ml-auto mr-auto" style={{ maxWidth: 1040 }}>
            <SharingPane
              resource={resource}
              resourceType={resourceType}
              onCreatePublicLink={onCreatePublicLink}
              onDisablePublicLink={onDisablePublicLink}
              extensions={extensions}
              getPublicUrl={getPublicUrl}
              onChangeEmbedType={setEmbedType}
              isAdmin={isAdmin}
              isPublicSharingEnabled={isPublicSharingEnabled}
              isApplicationEmbeddingEnabled={isApplicationEmbeddingEnabled}
            />
          </div>
        </div>
      ) : embedType === "application" ? (
        <div className="flex flex-full">
          <AdvancedEmbedPane
            pane={pane}
            resource={resource}
            resourceType={resourceType}
            embedType={embedType}
            token={getSignedToken(
              resourceType,
              resource.id,
              previewParametersBySlug,
              secretKey,
              embeddingParams,
            )}
            iframeUrl={getSignedPreviewUrl(
              siteUrl,
              resourceType,
              resource.id,
              previewParametersBySlug,
              displayOptions,
              secretKey,
              embeddingParams,
            )}
            siteUrl={siteUrl}
            secretKey={secretKey}
            params={previewParametersBySlug}
            displayOptions={displayOptions}
            previewParameters={previewParameters}
            parameterValues={parameterValues}
            resourceParameters={resourceParameters}
            embeddingParams={embeddingParams}
            onChangeDisplayOptions={setDisplayOptions}
            onChangeEmbeddingParameters={setEmbeddingParams}
            onChangeParameterValue={(id: string, value: string) =>
              setParameterValues(prevState => ({
                ...prevState,
                [id]: value,
              }))
            }
            onChangePane={setPane}
            onSave={handleSave}
            onUnpublish={handleUnpublish}
            onDiscard={handleDiscard}
          />
        </div>
      ) : null}
    </div>
  );
};

function getDefaultEmbeddingParams(
  resource: EmbedResource,
  resourceParameters: EmbedResourceParameter[],
) {
  return filterValidResourceParameters(
    resourceParameters,
    resource.embedding_params || {},
  );
}

function filterValidResourceParameters(
  resourceParameters: EmbedResourceParameter[],
  embeddingParams: EmbeddingParameters,
) {
  const validParameters = resourceParameters.map(parameter => parameter.slug);

  return _.pick(embeddingParams, validParameters);
}

function getPreviewParameters(
  resourceParameters: EmbedResourceParameter[],
  embeddingParams: EmbeddingParameters,
) {
  return resourceParameters.filter(
    parameter => embeddingParams[parameter.slug] === "locked",
  );
}
