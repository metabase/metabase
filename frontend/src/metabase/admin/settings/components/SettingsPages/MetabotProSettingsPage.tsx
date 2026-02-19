import { useState } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { Accordion, Box, Stack, Text, Title } from "metabase/ui";

import { MetabotProHealthSection } from "../MetabotPro/MetabotProHealthSection";
import { MetabotProProviderSection } from "../MetabotPro/MetabotProProviderSection";
import { MetabotProSemanticSearchSection } from "../MetabotPro/MetabotProSemanticSearchSection";

export function MetabotProSettingsPage() {
  const [isProviderConfigured, setIsProviderConfigured] = useState(false);

  const handleProviderConfigured = (configured: boolean) => {
    setIsProviderConfigured(configured);
  };

  return (
    <SettingsPageWrapper
      title={t`Metabot Self-Hosting Pro`}
      description={t`Configure Metabot with your own AI provider for enhanced data exploration and analysis.`}
    >
      <Box maw="50rem">
        <Accordion
          multiple
          defaultValue={["provider", "health", "semantic"]}
          variant="separated"
        >
          <Accordion.Item value="provider">
            <Accordion.Control>
              <Title order={4}>{t`1. Connect to AI Provider`}</Title>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md" p="md">
                <Text size="sm" c="text-secondary">
                  {t`Select your AI provider and configure your API key to get started with Metabot.`}
                </Text>
                <MetabotProProviderSection
                  onConfigured={handleProviderConfigured}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="health">
            <Accordion.Control>
              <Title order={4}>{t`2. Instance Health`}</Title>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md" p="md">
                <Text size="sm" c="text-secondary">
                  {t`These checks run automatically in the background to help optimize Metabot's performance.`}
                </Text>
                <MetabotProHealthSection enabled={isProviderConfigured} />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="semantic">
            <Accordion.Control>
              <Title order={4}>{t`3. Semantic Search (Optional)`}</Title>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md" p="md">
                <Text size="sm" c="text-secondary">
                  {t`Optionally add semantic search for more accurate data discovery.`}
                </Text>
                <MetabotProSemanticSearchSection
                  enabled={isProviderConfigured}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Box>
    </SettingsPageWrapper>
  );
}
