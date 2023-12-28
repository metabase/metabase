import { useState } from "react";
import _ from "underscore";
import { t, jt } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Text } from "metabase/ui";
import {
  getSignedEmbedOptions,
  getSignTokenOptions,
} from "metabase/public/lib/code";
import { Icon } from "metabase/core/components/Icon";

import type {
  EmbedResource,
  EmbedResourceType,
  EmbeddingDisplayOptions,
  EmbeddingParameters,
} from "../../EmbedModal/types";

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
  className?: string;

  siteUrl: string;
  secretKey: string;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  params: EmbeddingParameters;
  displayOptions: EmbeddingDisplayOptions;
  withExamplesLink?: boolean;
} & (
  | {
      showDiff?: false;
      initialEmbeddingParams?: undefined;
    }
  | {
      showDiff: true;
      initialEmbeddingParams: EmbeddingParameters | undefined;
    }
);

export const EmbedCodePane = ({
  className,
  siteUrl,
  secretKey,
  resource,
  resourceType,
  params,
  displayOptions,
  showDiff,
  withExamplesLink,
  initialEmbeddingParams,
}: EmbedCodePaneProps): JSX.Element | null => {
  const serverCodeOptions = getSignTokenOptions({
    siteUrl,
    secretKey,
    resourceType,
    resourceId: resource.id,
    params,
    displayOptions,
  });

  const clientCodeOptions = getSignedEmbedOptions();

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

  return (
    <div className={className}>
      {showDiff ? (
        !_.isEqual(initialEmbeddingParams, params) ? (
          <CodeSample
            dataTestId="embed-backend"
            title={t`In addition to publishing changes, update the params in the payload, like this:`}
            selectedOptionName={selectedServerCodeOptionName}
            languageOptions={serverCodeOptions.map(({ name }) => name)}
            source={selectedServerCodeOption.parametersDiffSource}
            textHighlightMode={selectedServerCodeOption.mode}
            onChangeOption={setSelectedServerCodeOptionName}
          />
        ) : (
          <NoCodeDiffContainer spacing="1.5rem" align="center">
            <Icon name="sql" size={40} opacity={0.5} />
            <Text color="inherit">{t`If there’s any code you need to change, we’ll show you that here.`}</Text>
          </NoCodeDiffContainer>
        )
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};
