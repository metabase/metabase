import { useState } from "react";
import _ from "underscore";
import { t, jt } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import {
  getEmbedClientCodeExampleOptions,
  getEmbedServerCodeExampleOptions,
} from "metabase/public/lib/code";
import type {
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/lib/types";
import { Stack } from "metabase/ui";

import { DEFAULT_DISPLAY_OPTIONS } from "./config";
import { CodeSample } from "./CodeSample";

import "ace/mode-clojure";
import "ace/mode-javascript";
import "ace/mode-ruby";
import "ace/mode-html";
import "ace/mode-jsx";
import "ace/mode-jade";
import "ace/mode-html_ruby";

type EmbedCodePaneProps = {
  siteUrl: string;
  secretKey: string;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  params: EmbeddingParameters;
  displayOptions: EmbeddingDisplayOptions;
  withExamplesLink?: boolean;
  className?: string;
} & (
  | {
      variant: "overview" | "appearance";
      initialPreviewParameters?: undefined;
    }
  | {
      variant: "parameters";
      initialPreviewParameters: EmbeddingParameters;
    }
);

export const EmbedCodePane = ({
  siteUrl,
  secretKey,
  resource,
  resourceType,
  params,
  initialPreviewParameters,
  displayOptions,
  variant,
  withExamplesLink,

  className,
}: EmbedCodePaneProps): JSX.Element | null => {
  const serverCodeOptions = getEmbedServerCodeExampleOptions({
    siteUrl,
    secretKey,
    resourceType,
    resourceId: resource.id,
    params,
    displayOptions,
  });

  const clientCodeOptions = getEmbedClientCodeExampleOptions();

  const [selectedServerCodeOptionName, setSelectedServerCodeOptionName] =
    useState(serverCodeOptions[0].name);

  const [selectedClientCodeOptionName, setSelectedClientCodeOptionName] =
    useState(clientCodeOptions[0].name);

  const selectedServerCodeOption = serverCodeOptions.find(
    ({ name }) => name === selectedServerCodeOptionName,
  );

  const selectedClientCodeOption = clientCodeOptions.find(
    ({ name }) => name === selectedClientCodeOptionName,
  );

  if (!selectedClientCodeOption || !selectedServerCodeOption) {
    return null;
  }

  if (variant === "parameters") {
    const hasCodeDiff =
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

    return (
      <div className={className}>
        <CodeSample
          dataTestId="embed-backend"
          title={
            hasCodeDiff
              ? t`In addition to publishing changes, update the params in the payload, like this:`
              : undefined
          }
          selectedOptionName={selectedServerCodeOptionName}
          languageOptions={serverCodeOptions.map(({ name }) => name)}
          source={selectedServerCodeOption.source}
          textHighlightMode={selectedServerCodeOption.mode}
          highlightedText={selectedServerCodeOption.parametersSource}
          isHighlightedTextAccent={hasCodeDiff}
          onChangeOption={setSelectedServerCodeOptionName}
        />
      </div>
    );
  }

  if (variant === "appearance") {
    const hasCodeDiff = !_.isEqual(DEFAULT_DISPLAY_OPTIONS, displayOptions);
    return (
      <div className={className}>
        <CodeSample
          dataTestId="embed-backend"
          title={
            hasCodeDiff ? t`Here’s the code you’ll need to alter:` : undefined
          }
          selectedOptionName={selectedServerCodeOptionName}
          languageOptions={serverCodeOptions.map(({ name }) => name)}
          source={selectedServerCodeOption.source}
          textHighlightMode={selectedServerCodeOption.mode}
          highlightedText={selectedServerCodeOption.iframeUrlSource}
          isHighlightedTextAccent={hasCodeDiff}
          onChangeOption={setSelectedServerCodeOptionName}
        />
      </div>
    );
  }

  return (
    <Stack spacing="2rem" className={className}>
      <CodeSample
        dataTestId="embed-backend"
        title={t`Insert this code snippet in your server code to generate the signed embedding URL `}
        selectedOptionName={selectedServerCodeOptionName}
        languageOptions={serverCodeOptions.map(({ name }) => name)}
        source={selectedServerCodeOption.source}
        textHighlightMode={selectedServerCodeOption.mode}
        onChangeOption={setSelectedServerCodeOptionName}
      />
      <CodeSample
        dataTestId="embed-frontend"
        title={t`Then insert this code snippet in your HTML template or single page app.`}
        selectedOptionName={selectedClientCodeOptionName}
        languageOptions={clientCodeOptions.map(({ name }) => name)}
        source={selectedClientCodeOption.source}
        textHighlightMode={selectedClientCodeOption.mode}
        onChangeOption={setSelectedClientCodeOptionName}
      />

      {withExamplesLink && (
        <div className="text-centered mb2 mt2">
          <h4>{jt`More ${(
            <ExternalLink
              key="examples"
              href="https://github.com/metabase/embedding-reference-apps"
            >
              {t`examples on GitHub`}
            </ExternalLink>
          )}`}</h4>
        </div>
      )}
    </Stack>
  );
};
