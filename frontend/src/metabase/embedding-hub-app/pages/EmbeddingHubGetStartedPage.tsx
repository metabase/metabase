import { useState } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useHasTokenFeature } from "metabase/common/hooks";
import { EmbeddingHub } from "metabase/embedding/embedding-hub";
import { DocsLink } from "metabase/embedding/embedding-hub/components/DocsLink";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { useSetting } from "metabase/settings";
import {
  Anchor,
  Card,
  Group,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";

const MARKETING_DEMO_URL = "https://www.metabase.com/embedding-demo";

const HUB_SETUP_GUIDE_URLS = {
  permissions: `${Urls.embeddingHub()}/permissions-setup`,
  sso: `${Urls.embeddingHub()}/sso-setup`,
};

/**
 * The index tab: today's setup guide, re-laid out for a longer list of cards,
 * plus the three new ones.
 *
 * The card ignores `show-metabase-links` the same way admin does -- the hub is
 * admin-only, so the justification behind DocsLink's eslint suppression holds
 * here too even though the path is not under `admin/`.
 */
export function EmbeddingHubGetStartedPage() {
  return (
    <Stack mx="auto" py="xl" gap="xl" maw={800}>
      <Stack gap="xs">
        <Title order={1} c="text-primary">{t`Get started`}</Title>

        <Text c="text-secondary">{t`Follow the guide to get started with modular embedding`}</Text>
      </Stack>

      <EmbeddingHub setupGuideUrls={HUB_SETUP_GUIDE_URLS} />

      <Stack ml="2.7rem" gap="xl">
        <UsefulLinksCard />

        <SimpleGrid cols={2} spacing="md">
          <CustomThemeCard />
          <NaturalLanguageQueryingCard />
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}

function UsefulLinksCard() {
  const utm = {
    utm_campaign: "embedding-hub",
    utm_content: "embedding-hub-get-started",
  };

  return (
    <Card p="lg" withBorder>
      <Stack gap="sm">
        <Title order={4}>{t`Useful links`}</Title>

        <DocsLink docsPath="embedding/introduction" utm={utm}>
          <Anchor component="span">{t`Introduction to embedding`}</Anchor>
        </DocsLink>

        <ExternalLink href={MARKETING_DEMO_URL}>
          <Anchor component="span">{t`See an interactive demo`}</Anchor>
        </ExternalLink>

        <DocsLink docsPath="embedding/start" utm={utm}>
          <Anchor component="span">{t`Embedding documentation`}</Anchor>
        </DocsLink>
      </Stack>
    </Card>
  );
}

function CustomThemeCard() {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");

  return (
    <Card component={Link} to={Urls.embeddingHubAppearance()} p="lg" withBorder>
      <Group gap="sm" wrap="nowrap">
        <Icon name="palette" c="brand" />
        <Stack gap={2}>
          <Title order={5}>{t`Create a custom theme`}</Title>
          <Text c="text-secondary" size="sm">
            {hasSimpleEmbedding
              ? t`Match your embedded content to your product's colors and fonts.`
              : t`Available on paid plans. Match your embedded content to your product's colors and fonts.`}
          </Text>
        </Stack>
      </Group>
    </Card>
  );
}

/**
 * Two states. Unconfigured, the card opens the provider modal in place.
 * Configured, it links out to the admin AI page rather than reopening the
 * modal -- Alessio's call, not a technical constraint.
 */
function NaturalLanguageQueryingCard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isConfigured = useSetting("llm-metabot-configured?");

  const body = (
    <Group gap="sm" wrap="nowrap">
      <Icon name={isConfigured ? "check" : "insight"} c="brand" />
      <Stack gap={2}>
        <Title order={5}>{t`Configure natural language querying`}</Title>
        <Text c="text-secondary" size="sm">
          {isConfigured
            ? t`Connected. Manage your AI provider in admin.`
            : t`Connect an AI provider so embedded users can ask questions in plain language.`}
        </Text>
      </Stack>
    </Group>
  );

  if (isConfigured) {
    return (
      <Card component={Link} to={Urls.adminAiSettings()} p="lg" withBorder>
        {body}
      </Card>
    );
  }

  return (
    <>
      <Card p="lg" withBorder onClick={() => setIsModalOpen(true)}>
        {body}
      </Card>

      <AIProviderConfigurationModal
        opened={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
