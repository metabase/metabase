import { jt, t } from "ttag";
import { Text } from "metabase/ui";
import ExternalLink from "metabase/core/components/ExternalLink";
import { getDocsUrl } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";

import type {
  EmbeddingParameters,
  EmbedResource,
  EmbedResourceType,
  EmbedModalStep,
  EmbeddingDisplayOptions,
} from "../types";
import EmbedCodePane from "./EmbedCodePane";
import { SettingsTabLayout } from "./StaticEmbedSetupPane.styled";
import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";

export interface OverviewSettingsProps {
  embedType: EmbedModalStep;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  iframeUrl: string;
  token: string;
  siteUrl: string;
  secretKey: string;
  params: EmbeddingParameters;
  displayOptions: EmbeddingDisplayOptions;
}

export const OverviewSettings = ({
  embedType,
  resource,
  resourceType,
  iframeUrl,
  token,
  siteUrl,
  secretKey,
  params,
  displayOptions,
}: OverviewSettingsProps): JSX.Element => {
  const docsUrl = useSelector(state =>
    getDocsUrl(state, { page: "embedding/static-embedding" }),
  );

  const staticEmbedDocsLink = (
    <ExternalLink key="doc" href={docsUrl}>{t`documentation`}</ExternalLink>
  );

  return (
    <SettingsTabLayout
      settingsSlot={
        <StaticEmbedSetupPaneSettingsContentSection
          title={t`Setting up a static embed`}
        >
          <Text>{t`To embed this ${resourceType} in your application you’ll just need to publish it, and paste these code snippets in the proper places in your app.`}</Text>
          <br />
          <Text>{t`You can also hide or lock any of the dashboard’s parameters.`}</Text>
          <br />
          <Text>{jt`Check out the ${staticEmbedDocsLink} for more.`}</Text>
        </StaticEmbedSetupPaneSettingsContentSection>
      }
      previewSlot={
        <EmbedCodePane
          className="flex-full w-full"
          embedType={embedType}
          resource={resource}
          resourceType={resourceType}
          iframeUrl={iframeUrl}
          token={token}
          siteUrl={siteUrl}
          secretKey={secretKey}
          params={params}
          displayOptions={displayOptions}
          withExamplesLink
        />
      }
    />
  );
};
