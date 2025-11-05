import { useMemo, useState } from "react";

import { useSetting } from "metabase/common/hooks";
import {
  clojure,
  node,
  python,
  ruby,
} from "metabase/public/lib/code-templates";
import type {
  CodeSampleParameters,
  ServerCodeSampleConfig,
} from "metabase/public/lib/types";
import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";
import { getResourceTypeFromExperience } from "metabase-enterprise/embedding_iframe_sdk_setup/utils/get-resource-type-from-experience";

const getEmbedServerCodeExampleOptions = (
  codeSampleParameters: Omit<CodeSampleParameters, "displayOptions">,
): Omit<ServerCodeSampleConfig, "getIframeQuerySource">[] => [
  {
    id: "node",
    name: "Node.js",
    source: node.getServerSource(codeSampleParameters),
    parametersSource: node.getParametersSource(codeSampleParameters.params),
    language: "typescript",
    embedOption: "pug",
  },
  {
    id: "ruby",
    name: "Ruby",
    source: ruby.getServerSource(codeSampleParameters),
    parametersSource: ruby.getParametersSource(codeSampleParameters.params),
    language: "ruby",
    embedOption: "erb",
  },
  {
    id: "python",
    name: "Python",
    source: python.getServerSource(codeSampleParameters),
    parametersSource: python.getParametersSource(codeSampleParameters.params),
    language: "python",
    embedOption: "pug",
  },
  {
    id: "clojure",
    name: "Clojure",
    source: clojure.getServerSource(codeSampleParameters),
    parametersSource: clojure.getParametersSource(codeSampleParameters.params),
    language: "clojure",
    embedOption: "pug",
  },
];

export function useSdkIframeEmbedServerSnippet() {
  const { experience, resource, previewParameterValuesBySlug, settings } =
    useSdkIframeEmbedSetupContext();

  const isStaticEmbedding = !!settings.isStatic;
  const isQuestionOrDashboardEmbed =
    (experience === "dashboard" && settings.dashboardId) ||
    (experience === "chart" && settings.questionId);

  const siteUrl = useSetting("site-url");
  const secretKey = useSetting("embedding-secret-key");

  const resourceType = getResourceTypeFromExperience(experience);

  const serverSnippetOptions = useMemo(
    () =>
      resource && resourceType && secretKey
        ? getEmbedServerCodeExampleOptions({
            siteUrl,
            secretKey,
            resourceType,
            resourceId: resource.id,
            params: previewParameterValuesBySlug,
            // We don't need an iframe snippet, because we use EmbedJS snippet for frontent snippet
            withIframeSnippet: false,
          })
        : [],
    [previewParameterValuesBySlug, resource, resourceType, secretKey, siteUrl],
  );

  const [selectedServerSnippetId, setSelectedServerSnippetId] = useState(
    serverSnippetOptions[0]?.id,
  );

  const serverSnippetOption =
    serverSnippetOptions.find(({ id }) => id === selectedServerSnippetId) ??
    null;

  if (
    !isStaticEmbedding ||
    !isQuestionOrDashboardEmbed ||
    !serverSnippetOption
  ) {
    return null;
  }

  return {
    serverSnippetOptions,
    serverSnippetOption,
    selectedServerSnippetId,
    setSelectedServerSnippetId,
  };
}
