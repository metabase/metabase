import cx from "classnames";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { MoreServerSnippetExamplesLink } from "metabase/embedding/components/MoreServerSnippetExamplesLink/MoreServerSnippetExamplesLink";
import { getEmbedClientCodeExampleOptions } from "metabase/public/lib/code";
import type {
  EmbedResourceType,
  ServerCodeSampleConfig,
} from "metabase/public/lib/types";
import { Stack, Text } from "metabase/ui";

import { ClientEmbedCodePane } from "./ClientEmbedCodePane";
import { SettingsTabLayout } from "./StaticEmbedSetupPane.styled";
import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";

export interface OverviewSettingsProps {
  resourceType: EmbedResourceType;
  serverEmbedCodeSlot: ReactNode;
  selectedServerCodeOption: ServerCodeSampleConfig | undefined;
  onClientCodeCopy: (language: string) => void;
}

const clientCodeOptions = getEmbedClientCodeExampleOptions();

export const OverviewSettings = ({
  resourceType,
  serverEmbedCodeSlot,
  selectedServerCodeOption,
  onClientCodeCopy,
}: OverviewSettingsProps): JSX.Element => {
  const [selectedClientCodeOptionId, setSelectedClientCodeOptionId] = useState(
    clientCodeOptions[0].id,
  );

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This links only shows for admins.
  const { url: docsUrl } = useDocsUrl("embedding/static-embedding", {
    utm: {
      utm_source: "product",
      utm_medium: "docs",
      utm_campaign: "embedding-static",
      utm_content: "static-embed-settings-overview",
    },
  });

  useEffect(() => {
    if (selectedServerCodeOption) {
      const { embedOption } = selectedServerCodeOption;

      if (
        embedOption &&
        clientCodeOptions.find(({ id }) => id === embedOption)
      ) {
        setSelectedClientCodeOptionId(embedOption);
      }
    }
  }, [selectedServerCodeOption]);

  return (
    <SettingsTabLayout
      settingsSlot={
        <StaticEmbedSetupPaneSettingsContentSection
          title={t`Setting up a static embed`}
        >
          <Text>{t`To embed this ${resourceType} in your application you’ll just need to publish it, and paste these code snippets in the proper places in your app.`}</Text>
          <br />
          {resourceType === "dashboard" && (
            <>
              <Text>{t`You can also hide or lock any of the dashboard’s parameters.`}</Text>
              <br />
            </>
          )}
          <Text>{jt`Check out the ${(
            <ExternalLink
              key="doc"
              href={docsUrl}
            >{t`documentation`}</ExternalLink>
          )} for more.`}</Text>
        </StaticEmbedSetupPaneSettingsContentSection>
      }
      previewSlot={
        <Stack gap="2rem" className={cx(CS.flexFull, CS.wFull)}>
          {serverEmbedCodeSlot}

          <ClientEmbedCodePane
            clientCodeOptions={clientCodeOptions}
            selectedClientCodeOptionId={selectedClientCodeOptionId}
            setSelectedClientCodeOptionId={setSelectedClientCodeOptionId}
            onCopy={() => onClientCodeCopy(selectedClientCodeOptionId)}
          />

          <MoreServerSnippetExamplesLink />
        </Stack>
      }
    />
  );
};
