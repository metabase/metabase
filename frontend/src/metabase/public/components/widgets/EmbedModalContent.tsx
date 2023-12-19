import { useState } from "react";
import _ from "underscore";
import type {
  ParameterId,
  ParameterValue,
  ResourceEmbeddingParams,
} from "metabase-types/api";
import { useSelector } from "metabase/lib/redux";
import AdvancedEmbedPane from "metabase/public/components/widgets/AdvancedEmbedPane";
import { SharingPane } from "metabase/public/components/widgets/SharingPane";
import type {
  EmbedModalStep,
  EmbedResource,
  ExportFormatType,
  Resource,
} from "metabase/public/components/widgets/types";
import { getSignedPreviewUrl, getSignedToken } from "metabase/public/lib/embed";
import { getSetting } from "metabase/selectors/settings";
import type { UiParameter } from "metabase-lib/parameters/types";

type EmbedModalContentProps = {
  resourceParameters: UiParameter[];

  embedType: EmbedModalStep;
  setEmbedType: (embedType: EmbedModalStep) => void;

  onCreatePublicLink: () => void;
  onDeletePublicLink: () => void;
  getPublicUrl: (resource: Resource, extension?: ExportFormatType) => void;

  onUpdateEmbeddingParams: (embeddingParams: ResourceEmbeddingParams) => void;
  onUpdateEnableEmbedding: (enableEmbedding: boolean) => void;

  onClose: () => void;
} & EmbedResource;

export const EmbedModalContent = (props: EmbedModalContentProps) => {
  const siteUrl = useSelector(state => getSetting(state, "site-url"));
  const secretKey = useSelector(state =>
    getSetting(state, "embedding-secret-key"),
  );

  const [displayOptions, setDisplayOptions] = useState({
    font: null,
    theme: null,
    bordered: true,
    titled: true,
  });

  const [pane, setPane] = useState("preview");
  const [embeddingParams, setEmbeddingParams] =
    useState<ResourceEmbeddingParams>(getDefaultEmbeddingParams(props));
  const [parameterValues, setParameterValues] = useState<
    Record<ParameterId, ParameterValue>
  >({});

  const handleSave = async () => {
    try {
      const { resource, embedType } = props;
      if (embedType === "application") {
        if (!resource.enable_embedding) {
          await props.onUpdateEnableEmbedding(true);
        }
        await props.onUpdateEmbeddingParams(embeddingParams);
      } else {
        if (!resource.public_uuid) {
          await props.onCreatePublicLink();
        }
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleUnpublish = async () => {
    await props.onUpdateEnableEmbedding(false);
  };

  const handleDiscard = () => {
    setEmbeddingParams(getDefaultEmbeddingParams(props));
  };

  const getPreviewParameters = (
    resourceParameters: UiParameter[],
    embeddingParams: ResourceEmbeddingParams,
  ) => {
    const lockedParameters = resourceParameters.filter(
      parameter => embeddingParams[parameter.slug] === "locked",
    );

    return lockedParameters;
  };

  const getPreviewParamsBySlug = () => {
    const { resourceParameters } = props;

    const lockedParameters = getPreviewParameters(
      resourceParameters,
      embeddingParams,
    );

    return Object.fromEntries(
      lockedParameters.map((parameter: UiParameter) => [
        parameter.slug,
        parameterValues[parameter.id] ?? null,
      ]),
    );
  };

  const {
    resource,
    resourceType,
    resourceParameters,
    embedType,
    setEmbedType,
  } = props;

  const previewParametersBySlug = getPreviewParamsBySlug();
  const previewParameters = getPreviewParameters(
    props.resourceParameters,
    embeddingParams,
  );

  return embedType == null ? (
    <SharingPane {...props} onChangeEmbedType={setEmbedType} />
  ) : embedType === "application" ? (
    <div className="flex flex-full" style={{ height: "100%" }}>
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
        onChangeParameterValue={(id: ParameterId, value: ParameterValue) =>
          setParameterValues({
            ...parameterValues,
            [id]: value,
          })
        }
        onChangePane={setPane}
        onSave={handleSave}
        onUnpublish={handleUnpublish}
        onDiscard={handleDiscard}
      />
    </div>
  ) : null;
};

function getDefaultEmbeddingParams({
  resource,
  resourceParameters,
}: {
  resource: Resource;
  resourceParameters: UiParameter[];
}) {
  return filterValidResourceParameters(
    resource.embedding_params || {},
    resourceParameters,
  );
}

function filterValidResourceParameters(
  embeddingParams: ResourceEmbeddingParams,
  resourceParameters: UiParameter[],
) {
  const validParameters = resourceParameters.map(parameter => parameter.slug);

  return _.pick(embeddingParams, validParameters);
}
