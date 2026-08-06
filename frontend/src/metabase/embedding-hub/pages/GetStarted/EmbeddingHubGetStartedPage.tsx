import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import {
  useCompletedSetupGuideSteps,
  useSetupGuideModals,
  useGetSetupGuideSteps,
} from "metabase/embedding/setup-guide";
import type {
  SetupGuideAction,
  SetupGuideStepId,
} from "metabase/embedding/setup-guide/types/setup-guide";
import { UpsellProBanner } from "metabase/embedding-hub/components/UpsellProBanner";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import { useSelector } from "metabase/redux";
import { getUrlWithUtm } from "metabase/selectors/settings";
import { useSetting } from "metabase/settings";
import {
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { ChecklistCard } from "./ChecklistCard";
import S from "./GetStarted.module.css";

const MARKETING_DEMO_URL = "https://www.metabase.com/embedding-demo";

const SETUP_GUIDE_URLS = {
  permissions: `${Urls.embeddingHub()}/permissions-setup`,
  sso: `${Urls.embeddingHub()}/sso-setup`,
};

type ChecklistStep = {
  id: SetupGuideStepId;
  icon: IconName;
  title: string;
  description: string;
};

/**
 * Title and description come from the design rather than from
 * `useGetSetupGuideSteps`, which also drives the home page stepper and would
 * change there too. Only the action and the completion state come from the
 * hook.
 */
function getFirstEmbedSteps(): ChecklistStep[] {
  return [
    {
      id: "add-data",
      icon: "database",
      title: t`Connect a database`,
      description: t`Automatically generate a dashboard from your data using x-rays.`,
    },
    {
      id: "create-dashboard",
      icon: "dashboard",
      title: t`Create a dashboard`,
      description: t`Automatically generate a dashboard from your data using x-rays.`,
    },
    {
      id: "create-test-embed",
      icon: "embed",
      title: t`Get embed snippet`,
      description: t`Embed a dashboard, question, the query builder or the collection browser. Configure the experience and customize the appearance.`,
    },
  ];
}

function getFineTuneSteps(): ChecklistStep[] {
  return [
    {
      id: "data-permissions-and-enable-tenants",
      icon: "group",
      title: t`Configure data permissions and tenants`,
      description: t`Share data with external users and allow them to create content.`,
    },
    {
      id: "sso-configured",
      icon: "lock",
      title: t`Set up SSO`,
      description: t`Configure JWT authentication to ensure only authorized users can access your embeds.`,
    },
    {
      id: "embed-production",
      icon: "embed",
      title: t`Embed in production with SSO`,
      description: t`Embed a dashboard, question, the query builder or the collection browser. Configure the experience and customize the appearance.`,
    },
  ];
}

export function EmbeddingHubGetStartedPage() {
  const steps = useGetSetupGuideSteps(SETUP_GUIDE_URLS);
  const { data: completedSteps } = useCompletedSetupGuideSteps();
  const { setOpenedModal, modals } = useSetupGuideModals();

  // Each Fine-tune step is locked by the feature it actually needs, not by one
  // stand-in for "Pro": an instance can license SSO without modular embedding,
  // and greying its SSO steps out would be wrong.
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const hasSsoJwt = useHasTokenFeature("sso_jwt");
  const hasTenants = useHasTokenFeature("tenants");

  // A feature-locked step carries no reason: naming a prerequisite would imply
  // the step is reachable, and the upsell banner already says what it takes.
  const lockedSteps: Partial<
    Record<SetupGuideStepId, { reason?: string } | undefined>
  > = useMemo(() => {
    const isSsoConfigured = completedSteps?.["sso-configured"] ?? false;

    return {
      "data-permissions-and-enable-tenants": hasTenants ? undefined : {},
      "sso-configured": hasSsoJwt ? undefined : {},
      "embed-production": match({ hasSsoJwt, isSsoConfigured })
        .with({ hasSsoJwt: false }, () => ({}))
        .with({ isSsoConfigured: false }, () => ({
          reason: t`Set up SSO to unlock`,
        }))
        .otherwise(() => undefined),
    };
  }, [completedSteps, hasSsoJwt, hasTenants]);

  const actionsByStepId = useMemo(() => {
    const entries = steps.flatMap((step) =>
      step.actions.map((action) => [action.stepId ?? step.id, action] as const),
    );

    // Object.fromEntries widens the key to `string`; the entries are built
    // from SetupGuideStepId, and a missing id is handled by the caller.
    return Object.fromEntries(entries) as Record<
      SetupGuideStepId,
      SetupGuideAction | undefined
    >;
  }, [steps]);

  function renderStep(
    { id, icon, title, description }: ChecklistStep,
    step: number,
  ) {
    const action = actionsByStepId[id];
    const isLocked = lockedSteps[id] != null;

    // The shared hook omits steps whose feature the instance lacks -- tenants
    // drops step 4 below the paywall. The design still shows those, greyed, so
    // a missing action only removes the card when the step is not locked.
    if (!action && !isLocked) {
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
        title={title}
        description={description}
        isDone={completedSteps?.[id] ?? false}
        isLocked={isLocked}
        lockedReason={lockedSteps[id]?.reason}
        to={to}
        onClick={onClick}
      />
    );
  }

  return (
    <Stack gap="2.5rem">
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

        <Box className={S.cardGrid}>
          {getFirstEmbedSteps().map((step, index) =>
            renderStep(step, index + 1),
          )}
        </Box>
      </Stack>

      <Stack gap="md">
        {/* Below the paywall the design replaces the subtitle with the upsell
            banner rather than stacking both. The banner is a sibling of the
            heading, not part of its 4px stack, so it sits at the section's
            own spacing. */}
        <Stack gap={4}>
          <Title order={3} c="text-primary">{t`Fine-tune your embed`}</Title>

          {hasSimpleEmbedding && (
            <Text c="text-secondary">
              {t`If you have a more sophisticated setup in mind, with many users and tenants, then keep going.`}
            </Text>
          )}
        </Stack>

        {!hasSimpleEmbedding && (
          <UpsellProBanner
            title={t`Upgrade to Metabase Pro to configure advanced options.`}
            location="embedding-hub-get-started"
          />
        )}

        <Box className={S.cardGrid}>
          {getFineTuneSteps().map((step, index) =>
            renderStep(step, index + getFirstEmbedSteps().length + 1),
          )}

          <CustomThemeCard step={7} isLocked={!hasSimpleEmbedding} />
          <ConfigureAiCard step={8} />
        </Box>
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
function CustomThemeCard({
  step,
  isLocked,
}: {
  step: number;
  isLocked: boolean;
}) {
  return (
    <ChecklistCard
      step={step}
      isLocked={isLocked}
      icon="palette"
      title={t`Create a custom theme`}
      description={t`Fine-tune the appearance of your embedded content with colors and fonts.`}
      to={Urls.embeddingHubAppearance()}
    />
  );
}

function ConfigureAiCard({ step }: { step: number }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const hasMetabot = useHasTokenFeature("metabot-v3");

  // Both halves, as the checklist spec has it: credentials for the selected
  // provider, and embedded Metabot actually switched on. `embedded-metabot-
  // enabled?` defaults to true, so on its own it would report a fresh instance
  // as done; `llm-metabot-configured?` on its own misses the embed switch.
  const hasCredentials = useSetting("llm-metabot-configured?");
  const isEmbeddedMetabotEnabled = useSetting("embedded-metabot-enabled?");
  const isConfigured = Boolean(hasCredentials) && isEmbeddedMetabotEnabled;

  return (
    <>
      <ChecklistCard
        step={step}
        isLocked={!hasMetabot}
        icon="metabot"
        title={t`Configure AI`}
        description={t`Set up AI in the Admin to embed an AI chat interface to let your users query data using natural language.`}
        isDone={isConfigured}
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
  // `embedding_hub`, underscored, is what the existing hub already sends
  // (setup-guide/components/SetupGuide.tsx). Hyphens are the house style
  // everywhere else, but matching the live value keeps this one campaign
  // across the rewrite rather than splitting it in two.
  const campaign = "embedding_hub";

  // Content identifies the link, not the page: one value for all three would
  // report clicks without saying which card was clicked.
  const docsUtm = (content: string) => ({
    utm_source: "product",
    utm_medium: "docs",
    utm_campaign: campaign,
    utm_content: content,
  });

  // The hub is admin-only, so these always show. The rule is already off for
  // this directory in eslint.config.mjs, same as for admin/**.
  const { url: introductionUrl } = useDocsUrl("embedding/introduction", {
    utm: docsUtm("get-started-embedding-methods"),
  });
  const { url: documentationUrl } = useDocsUrl("embedding/start", {
    utm: docsUtm("get-started-documentation"),
  });

  // The demo goes to marketing rather than the docs, so it does not run
  // through useDocsUrl -- but it is the one link here that most wants
  // attribution, so it gets the same treatment by hand.
  const demoUrl = useSelector((state) =>
    getUrlWithUtm(state, {
      url: MARKETING_DEMO_URL,
      utm_source: "product",
      utm_medium: "demo",
      utm_campaign: campaign,
      utm_content: "get-started-demo",
    }),
  );

  return (
    <Stack gap="md">
      <Title order={3} c="text-primary">{t`Useful links`}</Title>

      <Box className={S.cardGrid}>
        <UsefulLink
          icon="embed"
          label={t`Embedding methods`}
          href={introductionUrl}
        />
        <UsefulLink icon="embed_static" label={t`Demo`} href={demoUrl} />
        <UsefulLink
          icon="reference"
          label={t`Documentation`}
          href={documentationUrl}
        />
      </Box>
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
        <FixedSizeIcon name={icon} size={16} c="brand" />
        <Text fz="md" c="text-primary">
          {label}
        </Text>
      </Group>
    </Card>
  );
}
