import type { Ref } from "react";
import { useRef } from "react";
import { t, jt } from "ttag";
import type {
  EmbeddingParameters,
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/components/EmbedModal";
import ExternalLink from "metabase/core/components/ExternalLink";
import {
  getSignedEmbedOptions,
  getSignTokenOptions,
} from "metabase/public/lib/code";

import CodeSample from "./CodeSample";

import "ace/mode-clojure";
import "ace/mode-javascript";
import "ace/mode-ruby";
import "ace/mode-html";
import "ace/mode-jsx";

export const EmbedCodePane = ({
  className,
  siteUrl,
  secretKey,
  resource,
  resourceType,
  params,
  displayOptions,
  withExamplesLink,
}: {
  className?: string;
  siteUrl: string;
  secretKey: string;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  params: EmbeddingParameters;
  displayOptions: Record<string, unknown>;
  withExamplesLink?: boolean;
}) => {
  const codeSampleRef: Ref<CodeSample> = useRef(null);

  return (
    <div className={className}>
      <CodeSample
        title={t`Insert this code snippet in your server code to generate the signed embedding URL `}
        options={getSignTokenOptions({
          siteUrl,
          secretKey,
          resourceType,
          resourceId: resource.id,
          params,
          displayOptions,
        })}
        onChangeOption={(option: { name: string; embedOption: string }) => {
          if (
            option &&
            option.embedOption &&
            codeSampleRef.current &&
            codeSampleRef.current.setOption
          ) {
            codeSampleRef.current.setOption(option.embedOption);
          }
        }}
        dataTestId="embed-backend"
      />
      <CodeSample
        className="mt2"
        ref={codeSampleRef}
        title={t`Then insert this code snippet in your HTML template or single page app.`}
        options={getSignedEmbedOptions()}
        dataTestId="embed-frontend"
      />

      {withExamplesLink && (
        <div className="text-centered mt4">
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
