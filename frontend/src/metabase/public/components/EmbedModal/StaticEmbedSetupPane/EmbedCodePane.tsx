import { useState } from "react";
import _ from "underscore";
import { t, jt } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Text } from "metabase/ui";
import {
  getEmbedClientCodeExampleOptions,
  getEmbedServerCodeExampleOptions,
} from "metabase/public/lib/code";
import { Icon } from "metabase/core/components/Icon";
import type {
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/lib/types";

import { DEFAULT_DISPLAY_OPTIONS } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/config";
import { NoCodeDiffContainer } from "./CodeSample.styled";
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
      showDiff?: false;
      variant?: undefined;
      initialEmbeddingParams?: undefined;
    }
  | {
      showDiff: true;
      variant: "parameters" | "appearance";
      initialEmbeddingParams: EmbeddingParameters | undefined;
    }
);

export const EmbedCodePane = ({
  siteUrl,
  secretKey,
  resource,
  resourceType,
  params,
  displayOptions,
  showDiff,
  variant,
  initialEmbeddingParams,
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

  if (showDiff) {
    const isParametersView = variant === "parameters";
    const isAppearanceView = variant === "appearance";

    return (
      <div className={className}>
        {isParametersView &&
          (!_.isEqual(initialEmbeddingParams, params) ? (
            <CodeSample
              dataTestId="embed-backend"
              title={t`In addition to publishing changes, update the params in the payload, like this:`}
              selectedOptionName={selectedServerCodeOptionName}
              languageOptions={serverCodeOptions.map(({ name }) => name)}
              source={selectedServerCodeOption.parametersSource}
              textHighlightMode={selectedServerCodeOption.mode}
              onChangeOption={setSelectedServerCodeOptionName}
            />
          ) : (
            <NoCodeDiffContainer spacing="1.5rem" align="center">
              <Icon name="sql" size={40} opacity={0.5} />
              <Text color="inherit">{t`If there’s any code you need to change, we’ll show you that here.`}</Text>
            </NoCodeDiffContainer>
          ))}

        {isAppearanceView &&
          (!_.isEqual(DEFAULT_DISPLAY_OPTIONS, displayOptions) ? (
            <CodeSample
              dataTestId="embed-backend"
              title={t`Here’s the code you’ll need to alter:`}
              selectedOptionName={selectedServerCodeOptionName}
              languageOptions={serverCodeOptions.map(({ name }) => name)}
              source={selectedServerCodeOption.iframeUrlSource}
              textHighlightMode={selectedServerCodeOption.mode}
              onChangeOption={setSelectedServerCodeOptionName}
            />
          ) : (
            <NoCodeDiffContainer spacing="1.5rem" align="center">
              <Icon name="sql" size={40} opacity={0.5} />
              <Text color="inherit">{t`If there’s any code you need to change, we’ll show you that here.`}</Text>
            </NoCodeDiffContainer>
          ))}
      </div>
    );
  }

  return (
    <div className={className}>
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
        className="mt2"
        dataTestId="embed-frontend"
        title={t`Then insert this code snippet in your HTML template or single page app.`}
        selectedOptionName={selectedClientCodeOptionName}
        languageOptions={clientCodeOptions.map(({ name }) => name)}
        source={selectedClientCodeOption.source}
        textHighlightMode={selectedClientCodeOption.mode}
        onChangeOption={setSelectedClientCodeOptionName}
      />

      {withExamplesLink && (
        <div className="text-centered mb2 mt4">
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
    </div>
  );
};
