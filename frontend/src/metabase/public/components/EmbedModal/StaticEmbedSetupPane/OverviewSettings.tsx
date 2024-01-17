import { jt, t } from "ttag";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Box, Center, Stack, Text } from "metabase/ui";
import ExternalLink from "metabase/core/components/ExternalLink";
import { getDocsUrl } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";
import type {
  EmbedResourceType,
  ServerCodeSampleConfig,
} from "metabase/public/lib/types";
import { getEmbedClientCodeExampleOptions } from "metabase/public/lib/code";

import { ClientEmbedCodePane } from "./ClientEmbedCodePane";
import { SettingsTabLayout } from "./StaticEmbedSetupPane.styled";
import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";

export interface OverviewSettingsProps {
  resourceType: EmbedResourceType;
  serverEmbedCodeSlot: ReactNode;
  selectedServerCodeOption: ServerCodeSampleConfig | undefined;
}

export const OverviewSettings = ({
  resourceType,
  serverEmbedCodeSlot,
  selectedServerCodeOption,
}: OverviewSettingsProps): JSX.Element => {
  const docsUrl = useSelector(state =>
    getDocsUrl(state, { page: "embedding/static-embedding" }),
  );

  const clientCodeOptions = getEmbedClientCodeExampleOptions();

  const [selectedClientCodeOptionName, setSelectedClientCodeOptionName] =
    useState(clientCodeOptions[0].name);

  useEffect(() => {
    if (selectedServerCodeOption) {
      const { embedOption } = selectedServerCodeOption;

      if (
        embedOption &&
        clientCodeOptions.find(({ name }) => name === embedOption)
      ) {
        setSelectedClientCodeOptionName(embedOption);
      }
    }
  }, [clientCodeOptions, selectedServerCodeOption]);

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

          <ClientEmbedCodePane
            clientCodeOptions={clientCodeOptions}
            selectedClientCodeOptionName={selectedClientCodeOptionName}
            setSelectedClientCodeOptionName={setSelectedClientCodeOptionName}
          />

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
