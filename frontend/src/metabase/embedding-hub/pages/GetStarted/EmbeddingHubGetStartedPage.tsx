import cx from "classnames";
import { type ReactNode, useCallback, useMemo, useState } from "react";
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
 * The hub's own step definition. It carries the action as well as the copy: the
 * shared checklist drives the home-page stepper, whose wording and wiring are
 * its own. Only completion is shared, keyed by `SetupGuideStepId`.
 */
type HubStep = {
  id: SetupGuideStepId;
  icon: IconName;
  title: string;
  description: string;
  to?: string;
  onClick?: () => void;
};

/** Renders one card once its position in the checklist is known. */
type NumberedCard = (step: number) => ReactNode;

const UPSELL_CAMPAIGN = "embedding-hub";
const UPSELL_LOCATION = "embedding-hub-get-started";

export function EmbeddingHubGetStartedPage() {
  const dispatch = useDispatch();
  const { data: completedSteps } = useCompletedSetupGuideSteps();
  const { setOpenedModal, modals } = useSetupGuideModals(
    Urls.embeddingHubGetStarted(),
  );

  const openEmbedModal = useCallback(
    (initialState: SdkIframeEmbedSetupModalInitialState) => {
      dispatch(setOpenModalWithProps({ id: "embed", props: { initialState } }));
    },
    [dispatch],
  );

  // The hub is the only host that renders the setup guide without
  // `embedding_simple`: the home-page stepper checks it, and the admin guide's
  // nav item is behind it too. So this is the one place that has to reckon with
  // an unlicensed instance, and each Fine-tune step is locked by the feature it
  // actually needs rather than one stand-in for "Pro" -- an instance can
  // license SSO without modular embedding, and greying its SSO steps out would
  // be wrong.
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const hasSsoJwt = useHasTokenFeature("sso_jwt");
  const hasTenants = useHasTokenFeature("tenants");

  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, {
      utm_campaign: UPSELL_CAMPAIGN,
      utm_content: UPSELL_LOCATION,
    }),
  );
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign: UPSELL_CAMPAIGN,
    location: UPSELL_LOCATION,
  });

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

  const firstEmbedSteps = useMemo(
    () => getFirstEmbedSteps({ setOpenedModal, openEmbedModal }),
    [setOpenedModal, openEmbedModal],
  );
  const fineTuneSteps = useMemo(
    () => getFineTuneSteps({ openEmbedModal }),
    [openEmbedModal],
  );

  function renderStep(step: HubStep, position: number) {
    const isLocked = lockedSteps[step.id] != null;

    return (
      <ChecklistCard
        key={step.id}
        step={position}
        icon={step.icon}
        title={step.title}
        description={step.description}
        isDone={completedSteps?.[step.id] ?? false}
        isLocked={isLocked}
        lockedReason={lockedSteps[step.id]?.reason}
        to={step.to}
        onClick={step.onClick}
      />
    );
  }

  const themeCard: NumberedCard = (position) => (
    <CustomThemeCard
      key="custom-theme"
      step={position}
      isLocked={!hasSimpleEmbedding}
      isDone={completedSteps?.["create-custom-theme"] ?? false}
    />
  );
  const aiCard: NumberedCard = (position) => (
    <ConfigureAiCard
      key="configure-ai"
      step={position}
      isConfigured={completedSteps?.["configure-ai"] ?? false}
    />
  );

  // Without modular embedding every Fine-tune step is locked, and AI is the one
  // advanced step still reachable -- so the design promotes it into the first
  // section. `embedding_simple` rather than the plan: Starter cloud is a paid
  // plan but cannot do modular embedding either, so a plan check would miss it.
  const firstSection: NumberedCard[] = [
    ...firstEmbedSteps.map(
      (step): NumberedCard =>
        (position) =>
          renderStep(step, position),
    ),
    ...(hasSimpleEmbedding ? [] : [aiCard]),
  ];
  const fineTuneSection: NumberedCard[] = [
    ...fineTuneSteps.map(
      (step): NumberedCard =>
        (position) =>
          renderStep(step, position),
    ),
    themeCard,
    ...(hasSimpleEmbedding ? [aiCard] : []),
  ];

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

        <Box
          className={cx(S.cardGrid, !hasSimpleEmbedding && S.cardGridTwoColumn)}
        >
          {firstSection.map((renderCard, index) => renderCard(index + 1))}
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
          <UpsellBanner
            title={t`Upgrade to Metabase Pro to configure advanced options.`}
            campaign={UPSELL_CAMPAIGN}
            location={UPSELL_LOCATION}
            buttonText={t`Try Metabase Pro`}
            buttonLink={upgradeUrl}
            onClick={triggerUpsellFlow}
            large
          />
        )}

        <Box
          className={cx(S.cardGrid, !hasSimpleEmbedding && S.cardGridTwoColumn)}
        >
          {fineTuneSection.map((renderCard, index) =>
            renderCard(firstSection.length + index + 1),
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

function getFirstEmbedSteps({
  setOpenedModal,
  openEmbedModal,
}: StepHandlers): HubStep[] {
  return [
    {
      id: "add-data",
      icon: "database",
      title: t`Connect a database`,
      description: t`Automatically generate a dashboard from your data using x-rays.`,
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
      description: t`Embed a dashboard, question, the query builder or the collection browser. Configure the experience and customize the appearance.`,
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
function CustomThemeCard({
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
      // Points at the admin theme listing until the hub grows its own Appearance
      // tab in EMB-1532; `/embedding/appearance` has no route yet, so linking
      // there would 404.
      to="/admin/embedding/themes"
    />
  );
}

// Deliberately not gated on a token feature: the admin AI page is available to
// any admin, and neither `ai-features-enabled?` nor `embedded-metabot-enabled?`
// is gated either, so a lock would claim the step is unavailable when it is not.
function ConfigureAiCard({
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
