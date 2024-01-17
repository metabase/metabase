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

import { DEFAULT_DISPLAY_OPTIONS } from "./config";
import { CodeSample } from "./CodeSample";

import "ace/mode-clojure";
import "ace/mode-javascript";
import "ace/mode-ruby";
import "ace/mode-python";

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

  const highlightedText =
    hasParametersCodeDiff || hasAppearanceCodeDiff
      ? ([
          hasParametersCodeDiff && selectedServerCodeOption.parametersSource,
          hasAppearanceCodeDiff &&
            selectedServerCodeOption.getIframeQuerySource,
        ].filter(Boolean) as string[])
      : undefined;

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
