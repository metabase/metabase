import { jt, t } from "ttag";
import type { ReactNode } from "react";
import { Box, Center, Stack, Text } from "metabase/ui";
import ExternalLink from "metabase/core/components/ExternalLink";
import { getDocsUrl } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";
import type { EmbedResourceType } from "metabase/public/lib/types";

import { ClientEmbedCodePane } from "./ClientEmbedCodePane";
import { SettingsTabLayout } from "./StaticEmbedSetupPane.styled";
import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";

export interface OverviewSettingsProps {
  resourceType: EmbedResourceType;
  serverEmbedCodeSlot: ReactNode;
}

export const OverviewSettings = ({
  resourceType,
  serverEmbedCodeSlot,
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
        <Stack spacing="2rem" className="flex-full w-full">
          {serverEmbedCodeSlot}

          <ClientEmbedCodePane />

          <Box my="1rem">
            <Center>
              <h4>{jt`More ${(
                <ExternalLink
                  key="examples"
                  href="https://github.com/metabase/embedding-reference-apps"
                >
                  {t`examples on GitHub`}
                </ExternalLink>
              )}`}</h4>
            </Center>
          </Box>
        </Stack>
      }
    />
  );
};
