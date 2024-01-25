import _ from "underscore";
import { t } from "ttag";
import { getEmbedServerCodeExampleOptions } from "metabase/public/lib/code";
import type {
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbedResource,
  EmbedResourceType,
  ServerCodeSampleConfig,
} from "metabase/public/lib/types";

import "ace/mode-clojure";
import "ace/mode-javascript";
import "ace/mode-ruby";
import "ace/mode-python";

import type { EmbedCodePaneVariant } from "./types";
import { DEFAULT_DISPLAY_OPTIONS } from "./config";
import { CodeSample } from "./CodeSample";

type EmbedCodePaneProps = {
  siteUrl: string;
  secretKey: string;
  variant: EmbedCodePaneVariant;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  params: EmbeddingParameters;
  displayOptions: EmbeddingDisplayOptions;
  initialPreviewParameters: EmbeddingParameters;

  serverCodeOptions: ServerCodeSampleConfig[];
  selectedServerCodeOptionName: string;
  setSelectedServerCodeOptionName: (languageName: string) => void;

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
  selectedServerCodeOptionName,
  setSelectedServerCodeOptionName,

  className,
}: EmbedCodePaneProps): JSX.Element | null => {
  const selectedServerCodeOption = serverCodeOptions.find(
    ({ name }) => name === selectedServerCodeOptionName,
  );

  if (!selectedServerCodeOption) {
    return null;
  }

  const { hasParametersCodeDiff, hasAppearanceCodeDiff, highlightedTexts } =
    getHighlightedText({
      initialPreviewParameters,
      params,
      selectedServerCodeOption,
      selectedServerCodeOptionName,
      siteUrl,
      secretKey,
      resourceType,
      resource,
      displayOptions,
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
      selectedOptionName={selectedServerCodeOptionName}
      languageOptions={serverCodeOptions.map(({ name }) => name)}
      source={selectedServerCodeOption.source}
      textHighlightMode={selectedServerCodeOption.mode}
      highlightedTexts={highlightedTexts}
      onChangeOption={setSelectedServerCodeOptionName}
    />
  );
};

function getHighlightedText({
  initialPreviewParameters,
  params,
  selectedServerCodeOption,
  selectedServerCodeOptionName,
  siteUrl,
  secretKey,
  resourceType,
  resource,
  displayOptions,
}: {
  siteUrl: string;
  secretKey: string;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  params: EmbeddingParameters;
  displayOptions: EmbeddingDisplayOptions;
  initialPreviewParameters: EmbeddingParameters;

  selectedServerCodeOption: ServerCodeSampleConfig;
  selectedServerCodeOptionName: string;
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
      }).find(({ name }) => name === selectedServerCodeOptionName)
        ?.parametersSource;

  const hasAppearanceCodeDiff = !_.isEqual(
    DEFAULT_DISPLAY_OPTIONS,
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
