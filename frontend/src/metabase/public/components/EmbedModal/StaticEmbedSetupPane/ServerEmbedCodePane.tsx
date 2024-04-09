import "ace/mode-clojure";
import "ace/mode-javascript";
import "ace/mode-python";
import "ace/mode-ruby";
import { t } from "ttag";
import _ from "underscore";

import { useSelector } from "metabase/lib/redux";
import { getEmbedServerCodeExampleOptions } from "metabase/public/lib/code";
import type {
  EmbeddingDisplayOptions,
  EmbeddingParametersValues,
  EmbedResource,
  EmbedResourceType,
  ServerCodeSampleConfig,
} from "metabase/public/lib/types";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";

import { CodeSample } from "./CodeSample";
import { getDefaultDisplayOptions } from "./config";
import type { EmbedCodePaneVariant } from "./types";

type EmbedCodePaneProps = {
  siteUrl: string;
  secretKey: string;
  variant: EmbedCodePaneVariant;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  params: EmbeddingParametersValues;
  displayOptions: EmbeddingDisplayOptions;
  initialPreviewParameters: EmbeddingParametersValues;

  serverCodeOptions: ServerCodeSampleConfig[];
  selectedServerCodeOptionId: string;
  setSelectedServerCodeOptionId: (languageName: string) => void;
  onCopy: () => void;

  className?: string;
};

export const ServerEmbedCodePane = ({
  siteUrl,
  secretKey,
  variant,
  resource,
  resourceType,
  params,
  displayOptions,
  initialPreviewParameters,
  serverCodeOptions,
  selectedServerCodeOptionId,
  setSelectedServerCodeOptionId,
  onCopy,

  className,
}: EmbedCodePaneProps): JSX.Element | null => {
  const selectedServerCodeOption = serverCodeOptions.find(
    ({ id }) => id === selectedServerCodeOptionId,
  );

  const canWhitelabel = useSelector(getCanWhitelabel);
  const shouldShowDownloadData = canWhitelabel && resourceType === "question";

  if (!selectedServerCodeOption) {
    return null;
  }

  const { hasParametersCodeDiff, hasAppearanceCodeDiff, highlightedTexts } =
    getHighlightedText({
      initialPreviewParameters,
      params,
      selectedServerCodeOption,
      selectedServerCodeOptionId,
      siteUrl,
      secretKey,
      resourceType,
      resource,
      displayOptions,
      shouldShowDownloadData,
    });

  const title = getTitle({
    variant,
    hasParametersCodeDiff,
    hasAppearanceCodeDiff,
  });

  return (
    <CodeSample
      dataTestId="embed-backend"
      className={className}
      title={title}
      selectedOptionId={selectedServerCodeOptionId}
      languageOptions={serverCodeOptions}
      source={selectedServerCodeOption.source}
      textHighlightMode={selectedServerCodeOption.mode}
      highlightedTexts={highlightedTexts}
      onChangeOption={setSelectedServerCodeOptionId}
      onCopy={onCopy}
    />
  );
};

function getHighlightedText({
  initialPreviewParameters,
  params,
  selectedServerCodeOption,
  selectedServerCodeOptionId,
  siteUrl,
  secretKey,
  resourceType,
  resource,
  displayOptions,
  shouldShowDownloadData,
}: {
  siteUrl: string;
  secretKey: string;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  params: EmbeddingParametersValues;
  displayOptions: EmbeddingDisplayOptions;
  initialPreviewParameters: EmbeddingParametersValues;

  selectedServerCodeOption: ServerCodeSampleConfig;
  selectedServerCodeOptionId: string;
  shouldShowDownloadData: boolean;
}) {
  const hasParametersCodeDiff =
    !_.isEqual(initialPreviewParameters, params) &&
    selectedServerCodeOption.parametersSource !==
      getEmbedServerCodeExampleOptions({
        siteUrl,
        secretKey,
        resourceType,
        resourceId: resource.id,
        params: initialPreviewParameters,
        displayOptions,
      }).find(({ id }) => id === selectedServerCodeOptionId)?.parametersSource;

  const hasAppearanceCodeDiff = !_.isEqual(
    getDefaultDisplayOptions(shouldShowDownloadData),
    displayOptions,
  );

  const highlightedTexts: string[] = [];
  if (hasParametersCodeDiff) {
    highlightedTexts.push(selectedServerCodeOption.parametersSource);
  }

  if (hasAppearanceCodeDiff) {
    highlightedTexts.push(selectedServerCodeOption.getIframeQuerySource);
  }

  return {
    hasParametersCodeDiff,
    hasAppearanceCodeDiff,
    highlightedTexts: highlightedTexts.length ? highlightedTexts : undefined,
  };
}

function getTitle({
  variant,
  hasParametersCodeDiff,
  hasAppearanceCodeDiff,
}: {
  variant: EmbedCodePaneVariant;
  hasParametersCodeDiff: boolean;
  hasAppearanceCodeDiff: boolean;
}) {
  if (variant === "overview") {
    return t`Insert this code snippet in your server code to generate the signed embedding URL`;
  }

  if (variant === "parameters") {
    return hasParametersCodeDiff
      ? t`In addition to publishing changes, update the params in the payload, like this:`
      : undefined;
  }

  if (variant === "appearance") {
    return hasAppearanceCodeDiff
      ? t`Here’s the code you’ll need to alter:`
      : undefined;
  }
}
