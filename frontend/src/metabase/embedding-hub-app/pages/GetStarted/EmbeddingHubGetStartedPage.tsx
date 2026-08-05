import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import {
  useCompletedEmbeddingHubSteps,
  useEmbeddingHubModals,
  useGetEmbeddingHubSteps,
} from "metabase/embedding/embedding-hub";
import type {
  EmbeddingHubAction,
  EmbeddingHubStepId,
} from "metabase/embedding/embedding-hub/types/embedding-checklist";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { useSetting } from "metabase/settings";
import { Card, Group, Icon, SimpleGrid, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { ChecklistCard } from "./ChecklistCard";
import S from "./GetStarted.module.css";

const MARKETING_DEMO_URL = "https://www.metabase.com/embedding-demo";

const SETUP_GUIDE_URLS = {
  permissions: `${Urls.embeddingHub()}/permissions-setup`,
  sso: `${Urls.embeddingHub()}/sso-setup`,
};

/** The order and copy come from the design; the icons match its glyphs. */
const FIRST_EMBED_STEPS: { id: EmbeddingHubStepId; icon: IconName }[] = [
  { id: "add-data", icon: "database" },
  { id: "create-dashboard", icon: "dashboard" },
  { id: "create-test-embed", icon: "embed" },
];

const FINE_TUNE_STEPS: { id: EmbeddingHubStepId; icon: IconName }[] = [
  { id: "data-permissions-and-enable-tenants", icon: "group" },
  { id: "sso-configured", icon: "lock" },
  { id: "embed-production", icon: "embed" },
];

export function EmbeddingHubGetStartedPage() {
  const steps = useGetEmbeddingHubSteps(SETUP_GUIDE_URLS);
  const { data: completedSteps } = useCompletedEmbeddingHubSteps();
  const { setOpenedModal, modals } = useEmbeddingHubModals();

  // The design locks "Embed in production with SSO" until SSO is configured.
  const lockedSteps: Partial<Record<EmbeddingHubStepId, boolean>> = useMemo(
    () => ({ "embed-production": !completedSteps?.["sso-configured"] }),
    [completedSteps],
  );

  const actionsByStepId = useMemo(() => {
    const entries = steps.flatMap((step) =>
      step.actions.map((action) => [action.stepId ?? step.id, action] as const),
    );

    // Object.fromEntries widens the key to `string`; the entries are built
    // from EmbeddingHubStepId, and a missing id is handled by the caller.
    return Object.fromEntries(entries) as Record<
      EmbeddingHubStepId,
      EmbeddingHubAction | undefined
    >;
  }, [steps]);

  function renderStep(
    { id, icon }: { id: EmbeddingHubStepId; icon: IconName },
    step: number,
  ) {
    const action = actionsByStepId[id];

    if (!action) {
      return null;
    }

    const { to, onClick } = match(action)
      .with({ to: P.string }, ({ to }) => ({ to, onClick: undefined }))
      .with({ onClick: P.nonNullable }, ({ onClick }) => ({
        to: undefined,
        onClick,
      }))
      .with({ modal: P.nonNullable }, ({ modal }) => ({
        to: undefined,
        onClick: () => setOpenedModal(modal),
      }))
      .otherwise(() => ({ to: undefined, onClick: undefined }));

    return (
      <ChecklistCard
        key={id}
        step={step}
        icon={icon}
        title={action.title}
        description={action.description}
        isDone={completedSteps?.[id] ?? false}
        isLocked={lockedSteps[id] ?? false}
        to={to}
        onClick={onClick}
      />
    );
  }

  return (
    <Stack mx="auto" py="xl" gap="2.5rem" maw={880}>
      <Title order={1} c="text-primary">
        {t`Get started with Metabase Embedding`}
      </Title>

      <Stack gap="md">
        <Stack gap={4}>
          <Title order={3} c="text-primary">{t`Create your first embed`}</Title>
          <Text c="text-secondary">
            {t`If all you want is a simple embedded dashboard, these steps are all you need.`}
          </Text>
        </Stack>

        <SimpleGrid cols={3} spacing="md">
          {FIRST_EMBED_STEPS.map((step, index) => renderStep(step, index + 1))}
        </SimpleGrid>
      </Stack>

      <Stack gap="md">
        <Stack gap={4}>
          <Title order={3} c="text-primary">{t`Fine-tune your embed`}</Title>
          <Text c="text-secondary">
            {t`If you have a more sophisticated setup in mind, with many users and tenants, then keep going.`}
          </Text>
        </Stack>

        <SimpleGrid cols={3} spacing="md">
          {FINE_TUNE_STEPS.map((step, index) =>
            renderStep(step, index + FIRST_EMBED_STEPS.length + 1),
          )}

          <CustomThemeCard step={7} />
          <ConfigureAiCard step={8} />
        </SimpleGrid>
      </Stack>

      <UsefulLinksSection />

      {modals}
    </Stack>
  );
}

/**
 * Steps 7 and 8 are specific to the embedding hub: they are not in the shared
 * checklist, which also drives the home page.
 */
function CustomThemeCard({ step }: { step: number }) {
  return (
    <ChecklistCard
      step={step}
      icon="palette"
      title={t`Create a custom theme`}
      description={t`Fine-tune the appearance of your embedded content with colors and fonts.`}
      to={Urls.embeddingHubAppearance()}
    />
  );
}

function ConfigureAiCard({ step }: { step: number }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isConfigured = useSetting("llm-metabot-configured?");

  return (
    <>
      <ChecklistCard
        step={step}
        icon="metabot"
        title={t`Configure AI`}
        description={t`Set up AI in the Admin to embed an AI chat interface to let your users query data using natural language.`}
        isDone={Boolean(isConfigured)}
        // Configured, the card links out to the admin AI page rather than
        // reopening the modal. That is a product decision, not a constraint --
        // the modal still works, offering a switch-provider flow.
        to={isConfigured ? Urls.adminAiSettings() : undefined}
        onClick={isConfigured ? undefined : () => setIsModalOpen(true)}
      />

      <AIProviderConfigurationModal
        opened={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

function UsefulLinksSection() {
  const utm = {
    utm_source: "product",
    utm_medium: "docs",
    utm_campaign: "embedding-hub",
    utm_content: "embedding-hub-get-started",
  };

  // The hub is admin-only, so these always show. The rule is already off for
  // this directory in eslint.config.mjs, same as for admin/**.
  const { url: introductionUrl } = useDocsUrl("embedding/introduction", {
    utm,
  });
  const { url: documentationUrl } = useDocsUrl("embedding/start", { utm });

  return (
    <Stack gap="md">
      <Title order={3} c="text-primary">{t`Useful links`}</Title>

      <SimpleGrid cols={3} spacing="md">
        <UsefulLink
          icon="embed"
          label={t`Embedding methods`}
          href={introductionUrl}
        />
        <UsefulLink
          icon="embed_static"
          label={t`Demo`}
          href={MARKETING_DEMO_URL}
        />
        <UsefulLink
          icon="reference"
          label={t`Documentation`}
          href={documentationUrl}
        />
      </SimpleGrid>
    </Stack>
  );
}

function UsefulLink({
  icon,
  label,
  href,
}: {
  icon: IconName;
  label: string;
  href: string;
}) {
  return (
    <Card
      component={ExternalLink}
      href={href}
      p="md"
      withBorder
      className={S.interactiveCard}
    >
      <Group gap="sm" wrap="nowrap">
        <Icon name={icon} size={16} c="brand" />
        <Text fz="sm" c="text-primary">
          {label}
        </Text>
      </Group>
    </Card>
  );
}
