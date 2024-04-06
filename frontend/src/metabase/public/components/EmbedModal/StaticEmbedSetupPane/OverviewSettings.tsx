import cx from "classnames";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { jt, t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import ExternalLink from "metabase/core/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getEmbedClientCodeExampleOptions } from "metabase/public/lib/code";
import type {
  EmbedResourceType,
  ServerCodeSampleConfig,
} from "metabase/public/lib/types";
import { getDocsUrl, getSetting } from "metabase/selectors/settings";
import { Box, Center, Stack, Text } from "metabase/ui";

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
  const docsUrl = useSelector(state =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- Only appear to admins
    getDocsUrl(state, { page: "embedding/static-embedding" }),
  );
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  const [selectedClientCodeOptionId, setSelectedClientCodeOptionId] = useState(
    clientCodeOptions[0].id,
  );

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
              href={`${docsUrl}?utm_source=${plan}&utm_media=static-embed-settings-overview`}
            >{t`documentation`}</ExternalLink>
          )} for more.`}</Text>
        </StaticEmbedSetupPaneSettingsContentSection>
      }
      previewSlot={
        <Stack spacing="2rem" className={cx(CS.flexFull, CS.wFull)}>
          {serverEmbedCodeSlot}

          <ClientEmbedCodePane
            clientCodeOptions={clientCodeOptions}
            selectedClientCodeOptionId={selectedClientCodeOptionId}
            setSelectedClientCodeOptionId={setSelectedClientCodeOptionId}
            onCopy={() => onClientCodeCopy(selectedClientCodeOptionId)}
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
