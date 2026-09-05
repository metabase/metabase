import cx from "classnames";
import { useCallback, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UpsellBanner } from "metabase/common/components/upsells/components";
import { useDocsUrl, useHasTokenFeature } from "metabase/common/hooks";
import {
  useCompletedSetupGuideSteps,
  useSetupGuideModals,
} from "metabase/embedding/setup-guide";
import type {
  SetupGuideModalToTrigger,
  SetupGuideStepId,
} from "metabase/embedding/setup-guide/types/setup-guide";
import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";
import {
  PLUGIN_ADMIN_SETTINGS,
  type SdkIframeEmbedSetupModalInitialState,
} from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { getUpgradeUrl, getUrlWithUtm } from "metabase/selectors/settings";
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
  permissions: `${Urls.embeddingHubGetStarted()}/permissions-setup`,
  sso: `${Urls.embeddingHubGetStarted()}/sso-setup`,
};

/**
 * The hub shares only completion state with the home-page checklist, keyed by
 * `SetupGuideStepId`. Copy and actions are its own, because the two have
 * different designs: the home page is a linear stepper, the hub is grouped
 * cards with their own wording and entry points.
 */
type HubStep = {
  id: SetupGuideStepId;
  icon: IconName;
  title: string;
  description: string;
  to?: string;
  onClick?: () => void;
};

type HubCard =
  | { type: "step"; step: HubStep }
  | { type: "theme" }
  | { type: "ai" };

const UTM_CAMPAIGN = "embedding-hub";
const UTM_CONTENT = "embedding-hub-get-started-page";

export function EmbeddingHubGetStartedPage() {
  const dispatch = useDispatch();
  const { data: completedSteps } = useCompletedSetupGuideSteps();
  const { setOpenedModal, modals } = useSetupGuideModals({
    returnTo: Urls.embeddingHubGetStarted(),
  });

  const openEmbedModal = useCallback(
    (initialState: SdkIframeEmbedSetupModalInitialState) => {
      dispatch(setOpenModalWithProps({ id: "embed", props: { initialState } }));
    },
    [dispatch],
  );

  // The hub is the only place that renders the setup guide on OSS, so each step
  // needs its own feature check rather than one stand-in for "Pro".
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const hasSsoJwt = useHasTokenFeature("sso_jwt");
  const hasTenants = useHasTokenFeature("tenants");

  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, {
      utm_campaign: UTM_CAMPAIGN,
      utm_content: UTM_CONTENT,
    }),
  );
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign: UTM_CAMPAIGN,
    location: UTM_CONTENT,
  });

  // A locked step carries a reason only when the prerequisite is actionable.
  // Feature-locked steps leave it out: naming a prerequisite would imply the
  // step is reachable, and the upsell banner already says what it takes.
  const lockedSteps: Partial<
    Record<SetupGuideStepId, { isLocked: boolean; reason?: string }>
  > = useMemo(() => {
    const isSsoConfigured = completedSteps["sso-configured"];

    return {
      "data-permissions-and-enable-tenants": { isLocked: !hasTenants },
      "sso-configured": { isLocked: !hasSsoJwt },
      "embed-production": match({ hasSsoJwt, isSsoConfigured })
        .with({ hasSsoJwt: false }, () => ({ isLocked: true }))
        .with({ isSsoConfigured: false }, () => ({
          isLocked: true,
          reason: t`Set up SSO to unlock`,
        }))
        .otherwise(() => ({ isLocked: false })),
    };
  }, [completedSteps, hasSsoJwt, hasTenants]);

  const baseEmbedSteps = useMemo(
    () =>
      getBaseEmbedSteps({ setOpenedModal, openEmbedModal, hasSimpleEmbedding }),
    [setOpenedModal, openEmbedModal, hasSimpleEmbedding],
  );
  const fineTuneSteps = useMemo(
    () => getFineTuneSteps({ openEmbedModal }),
    [openEmbedModal],
  );

  function renderCard(card: HubCard, position: number) {
    switch (card.type) {
      case "step": {
        const { step } = card;
        const locked = lockedSteps[step.id];

        return (
          <ChecklistCard
            key={step.id}
            step={position}
            icon={step.icon}
            title={step.title}
            description={step.description}
            isDone={completedSteps[step.id]}
            isLocked={locked?.isLocked ?? false}
            lockedReason={locked?.reason}
            to={step.to}
            onClick={step.onClick}
          />
        );
      }
      case "theme":
        return (
          <ThemeCard
            key="custom-theme"
            step={position}
            isLocked={!hasSimpleEmbedding}
            isDone={completedSteps["create-custom-theme"]}
          />
        );
      case "ai":
        return (
          <AiCard
            key="configure-ai"
            step={position}
            isConfigured={completedSteps["configure-ai"]}
          />
        );
    }
  }

  // Without modular embedding every Fine-tune step is locked, and AI is the one
  // advanced step still reachable -- so the design promotes it into the first
  // section.
  const firstSection: HubCard[] = [
    ...baseEmbedSteps.map((step): HubCard => ({ type: "step", step })),
    ...(hasSimpleEmbedding ? [] : [{ type: "ai" as const }]),
  ];
  const fineTuneSection: HubCard[] = [
    ...fineTuneSteps.map((step): HubCard => ({ type: "step", step })),
    { type: "theme" },
    ...(hasSimpleEmbedding ? [{ type: "ai" as const }] : []),
  ];

  return (
    <Stack gap="2.5rem">
      <Title order={1} c="text-primary">
        {t`Get started with Metabase Embedding`}
      </Title>

      <Stack gap="lg">
        <Box>
          <Title order={3} c="text-primary">{t`Create your first embed`}</Title>
          <Text c="text-secondary" mt={4}>
            {hasSimpleEmbedding
              ? t`If all you want is a simple embedded dashboard, these steps are all you need.`
              : t`Start with the basics of Metabase embedding.`}
          </Text>
        </Box>

        <Box
          className={cx(S.cardGrid, !hasSimpleEmbedding && S.cardGridTwoColumn)}
        >
          {firstSection.map((card, index) => renderCard(card, index + 1))}
        </Box>
      </Stack>

      <Stack gap="lg">
        <Box>
          <Title order={3} c="text-primary">{t`Fine-tune your embed`}</Title>

          {hasSimpleEmbedding ? (
            <Text c="text-secondary" mt={4}>
              {t`If you have a more sophisticated setup in mind, with many users and tenants, then keep going.`}
            </Text>
          ) : (
            <Box mt="lg">
              <UpsellBanner
                title={t`Upgrade to Metabase Pro to configure advanced options.`}
                campaign={UTM_CAMPAIGN}
                location={UTM_CONTENT}
                buttonText={t`Try Metabase Pro`}
                buttonLink={upgradeUrl}
                onClick={triggerUpsellFlow}
                large
              />
            </Box>
          )}
        </Box>

        <Box
          className={cx(S.cardGrid, !hasSimpleEmbedding && S.cardGridTwoColumn)}
        >
          {fineTuneSection.map((card, index) =>
            renderCard(card, firstSection.length + index + 1),
          )}
        </Box>
      </Stack>

      <UsefulLinksSection />

      {modals}
    </Stack>
  );
}

type StepHandlers = {
  setOpenedModal: (modal: SetupGuideModalToTrigger) => void;
  openEmbedModal: (initialState: SdkIframeEmbedSetupModalInitialState) => void;
};

function getBaseEmbedSteps({
  setOpenedModal,
  openEmbedModal,
  hasSimpleEmbedding,
}: StepHandlers & { hasSimpleEmbedding: boolean }): HubStep[] {
  return [
    {
      id: "add-data",
      icon: "database",
      title: t`Connect a database`,
      description: t`Connect your own database or upload a CSV and start working with your real data.`,
      onClick: () => setOpenedModal({ type: "add-data", initialTab: "db" }),
    },
    {
      id: "create-dashboard",
      icon: "dashboard",
      title: t`Create a dashboard`,
      description: t`Automatically generate a dashboard from your data using x-rays.`,
      onClick: () => setOpenedModal({ type: "xray-dashboard" }),
    },
    {
      id: "create-test-embed",
      icon: "embed",
      title: t`Get embed snippet`,
      description: hasSimpleEmbedding
        ? t`Embed a dashboard, question, the query builder or the collection browser. Configure the experience and customize the appearance.`
        : t`Embed a dashboard or question. Configure the experience and customize the appearance.`,
      onClick: () => openEmbedModal({}),
    },
  ];
}

function getFineTuneSteps({
  openEmbedModal,
}: Pick<StepHandlers, "openEmbedModal">): HubStep[] {
  return [
    {
      id: "data-permissions-and-enable-tenants",
      icon: "group",
      title: t`Configure data permissions and tenants`,
      description: t`Share data with external users and allow them to create content.`,
      to: SETUP_GUIDE_URLS.permissions,
    },
    {
      id: "sso-configured",
      icon: "lock",
      title: t`Set up SSO`,
      description: t`Configure JWT authentication to ensure only authorized users can access your embeds.`,
      to: SETUP_GUIDE_URLS.sso,
    },
    {
      id: "embed-production",
      icon: "embed",
      title: t`Embed in production with SSO`,
      description: t`Embed a dashboard, question, the query builder or the collection browser. Configure the experience and customize the appearance.`,
      onClick: () =>
        openEmbedModal({ isGuest: false, useExistingUserSession: false }),
    },
  ];
}

/**
 * Steps 7 and 8 are specific to the embedding hub: they are not in the shared
 * checklist, which also drives `SetupGuideHomePage` -- the stepper Metabase
 * puts on the home page for admins while the `embedding-homepage` setting is
 * visible. That page keeps the shared steps only, so these two live here.
 */
function ThemeCard({
  step,
  isLocked,
  isDone,
}: {
  step: number;
  isLocked: boolean;
  isDone: boolean;
}) {
  return (
    <ChecklistCard
      step={step}
      isLocked={isLocked}
      isDone={isDone}
      icon="palette"
      title={t`Create a custom theme`}
      description={t`Fine-tune the appearance of your embedded content with colors and fonts.`}
      to={Urls.embeddingHubAppearance()}
    />
  );
}

// AI is available on both OSS and Pro, so this is the only card that moves
// between sections depending on the plan.
function AiCard({
  step,
  isConfigured,
}: {
  step: number;
  isConfigured: boolean;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <ChecklistCard
        step={step}
        icon="metabot"
        title={t`Configure AI`}
        description={t`Connect to an LLM provider to embed AI chat interfaces and let your users ask natural language queries.`}
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
  const docsUtm = {
    utm_source: "product",
    utm_medium: "docs",
    utm_campaign: UTM_CAMPAIGN,
    utm_content: UTM_CONTENT,
  };

  const { url: introductionUrl } = useDocsUrl("embedding/introduction", {
    utm: docsUtm,
  });
  const { url: documentationUrl } = useDocsUrl("embedding/start", {
    utm: docsUtm,
  });

  const demoUrl = useSelector((state) =>
    getUrlWithUtm(state, {
      url: MARKETING_DEMO_URL,
      utm_source: "product",
      utm_medium: "demo",
      utm_campaign: UTM_CAMPAIGN,
      utm_content: UTM_CONTENT,
    }),
  );

  return (
    <Stack gap="lg">
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
      p="lg"
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
