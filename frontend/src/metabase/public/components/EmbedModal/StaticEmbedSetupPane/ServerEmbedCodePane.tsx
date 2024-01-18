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

import { DEFAULT_DISPLAY_OPTIONS } from "./config";
import { CodeSample } from "./CodeSample";
import type { TextHighlightConfig } from "./types";

type EmbedCodePaneProps = {
  siteUrl: string;
  secretKey: string;
  variant: "overview" | "parameters" | "appearance";
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

  const { hasParametersCodeDiff, hasAppearanceCodeDiff, highlightedText } =
    getHighlightedCode({
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

  if (variant === "overview") {
    return (
      <CodeSample
        dataTestId="embed-backend"
        className={className}
        title={t`Insert this code snippet in your server code to generate the signed embedding URL `}
        selectedOptionName={selectedServerCodeOptionName}
        languageOptions={serverCodeOptions.map(({ name }) => name)}
        source={selectedServerCodeOption.source}
        textHighlightMode={selectedServerCodeOption.mode}
        highlightedText={highlightedText}
        onChangeOption={setSelectedServerCodeOptionName}
      />
    );
  }

  if (variant === "parameters") {
    return (
      <CodeSample
        dataTestId="embed-backend"
        className={className}
        title={
          hasParametersCodeDiff
            ? t`In addition to publishing changes, update the params in the payload, like this:`
            : undefined
        }
        selectedOptionName={selectedServerCodeOptionName}
        languageOptions={serverCodeOptions.map(({ name }) => name)}
        source={selectedServerCodeOption.source}
        textHighlightMode={selectedServerCodeOption.mode}
        highlightedText={highlightedText}
        onChangeOption={setSelectedServerCodeOptionName}
      />
    );
  }

  if (variant === "appearance") {
    return (
      <CodeSample
        dataTestId="embed-backend"
        className={className}
        title={
          hasAppearanceCodeDiff
            ? t`Here’s the code you’ll need to alter:`
            : undefined
        }
        selectedOptionName={selectedServerCodeOptionName}
        languageOptions={serverCodeOptions.map(({ name }) => name)}
        source={selectedServerCodeOption.source}
        textHighlightMode={selectedServerCodeOption.mode}
        highlightedText={highlightedText}
        onChangeOption={setSelectedServerCodeOptionName}
      />
    );
  }

  return null;
};

function getHighlightedCode({
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

  const highlightedText: TextHighlightConfig[] = [];
  if (hasParametersCodeDiff) {
    highlightedText.push({
      text: selectedServerCodeOption.parametersSource,
      mode: "fullLine",
    });
  }

  if (hasAppearanceCodeDiff) {
    highlightedText.push({
      text: selectedServerCodeOption.getIframeQuerySource,
      mode: "text",
    });
  }

  return {
    hasParametersCodeDiff,
    hasAppearanceCodeDiff,
    highlightedText: highlightedText.length ? highlightedText : undefined,
  };
}
