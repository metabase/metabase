import { useCallback, useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useUpdateMetabotSettingsMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import { formatNumber } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import { useMetabotSetupContext } from "metabase/metabot/components/MetabotAdmin/MetabotSetup";
import { getStoreUsers } from "metabase/selectors/store-users";
import {
  Anchor,
  Box,
  Checkbox,
  Flex,
  Group,
  Icon,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import {
  useGetMetabotUsageQuery,
  useRemoveCloudAddOnMutation,
} from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  METABASE_MANAGED_AI_FEATURE,
  METABASE_MANAGED_AI_PRODUCT_TYPE,
  METABASE_MANAGED_AI_TERMS_URL,
  METABASE_TIERED_AI_PRODUCT_TYPE,
  METABOT_V3_FEATURE,
  OFFER_METABASE_MANAGED_AI_FEATURE,
} from "../../constants";
import { formatMetabaseCost } from "../../format";
import {
  type MetabaseManagedAiPricing,
  useMetabaseManagedAiPricing,
} from "../../useMetabaseManagedAiPricing";
import { usePurchaseMetabaseManagedAi } from "../../usePurchaseMetabaseManagedAi";

import { MetabotSettingUpModal } from "./MetabotSettingUpModal";

export function MetabaseAIProviderSetup() {
  const offerMetabaseManagedAi = !!hasPremiumFeature(
    OFFER_METABASE_MANAGED_AI_FEATURE,
  );
  const hasMetabaseManagedAiProviderFeature = !!hasPremiumFeature(
    METABASE_MANAGED_AI_FEATURE,
  );
  const hasDeprecatedMetabaseAiProvider =
    !!hasPremiumFeature(METABOT_V3_FEATURE);

  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const isConfigured = useSetting("llm-metabot-configured?");

  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();

  const handleConnect = useCallback(async () => {
    await updateMetabotSettings({ provider: "metabase", model: "" }).unwrap();
  }, [updateMetabotSettings]);

  const {
    pricing: metabaseManagedAiPricing,
    isLoading: isLoadingMetabaseManagedAiPricing,
  } = useMetabaseManagedAiPricing(
    !hasDeprecatedMetabaseAiProvider || hasMetabaseManagedAiProviderFeature,
  );

  const metabaseManagedAiPurchase = usePurchaseMetabaseManagedAi();
  const [removeCloudAddOn, removeCloudAddOnResult] =
    useRemoveCloudAddOnMutation();

  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isSettingUpModalOpen, setIsSettingUpModalOpen] = useState(false);

  const handleMetabasePurchase = useCallback(async () => {
    setIsSettingUpModalOpen(true);

    try {
      await metabaseManagedAiPurchase.purchaseMetabaseManagedAi(
        hasAcceptedTerms,
      );
    } catch {
      setIsSettingUpModalOpen(false);
    }
  }, [hasAcceptedTerms, metabaseManagedAiPurchase]);

  const onConnect = match({
    hasAcceptedTerms,
    hasMetabaseManagedAiProviderFeature,
    hasDeprecatedMetabaseAiProvider,
    isConfigured,
    isStoreUser,
  })
    .with({ isConfigured: true }, () => null)
    .with({ hasMetabaseManagedAiProviderFeature: true }, () => handleConnect)
    .with({ hasDeprecatedMetabaseAiProvider: true }, () => handleConnect)
    .with(
      { hasMetabaseManagedAiProviderFeature: false, hasAcceptedTerms: false },
      () => null,
    )
    .with({ isStoreUser: false }, () => null)
    .otherwise(() => handleMetabasePurchase);

  const onDisconnect = useCallback(async () => {
    const feature = match({
      offerMetabaseManagedAi,
      hasMetabaseManagedAiProviderFeature,
      hasDeprecatedMetabaseAiProvider,
    })
      .returnType<
        | typeof METABASE_MANAGED_AI_PRODUCT_TYPE
        | typeof METABASE_TIERED_AI_PRODUCT_TYPE
        | null
      >()
      .with(
        { hasMetabaseManagedAiProviderFeature: true },
        () => METABASE_MANAGED_AI_PRODUCT_TYPE,
      )
      .with(
        { offerMetabaseManagedAi: true, hasDeprecatedMetabaseAiProvider: true },
        () => METABASE_TIERED_AI_PRODUCT_TYPE,
      )
      .with(
        {
          offerMetabaseManagedAi: false,
          hasDeprecatedMetabaseAiProvider: true,
        },
        // If we can't upgrade to managed AI, we don't want to disable the existing one.
        () => null,
      )
      .otherwise(() => {
        throw new Error("No feature is enabled to cancel");
      });

    if (!feature) {
      return;
    }

    await removeCloudAddOn({
      product_type: feature,
    }).unwrap();
  }, [
    offerMetabaseManagedAi,
    hasMetabaseManagedAiProviderFeature,
    hasDeprecatedMetabaseAiProvider,
    removeCloudAddOn,
  ]);

  const { isLoading } = useMetabotSetupContext(onConnect, onDisconnect);

  const metabaseManagedAiPurchaseError = metabaseManagedAiPurchase.error
    ? getErrorMessage(
        metabaseManagedAiPurchase.error,
        t`Unable to connect to this AI provider.`,
      )
    : undefined;

  const updateMetabotSettingsError = updateMetabotSettingsResult.error
    ? getErrorMessage(
        updateMetabotSettingsResult.error,
        t`Unable to connect to this AI provider.`,
      )
    : undefined;

  const removeMetabaseManagedAiError = removeCloudAddOnResult.error
    ? getErrorMessage(
        removeCloudAddOnResult.error,
        t`Unable to disconnect from this AI provider.`,
      )
    : undefined;

  return (
    <>
      {isConfigured ? (
        <MetabaseManagedProviderCard
          isLoadingPricing={isLoadingMetabaseManagedAiPricing}
          pricing={metabaseManagedAiPricing}
          hasDeprecatedMetabaseAiProvider={hasDeprecatedMetabaseAiProvider}
          hasMetabaseManagedAiProviderFeature={
            hasMetabaseManagedAiProviderFeature
          }
          offerMetabaseManagedAi={offerMetabaseManagedAi}
        />
      ) : (
        <>
          <Stack gap="md">
            <Title order={4}>{
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
              t`About Metabase AI service`
            }</Title>
            <Text>{
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
              t`The simplest way to get started with AI in Metabase. We pick a benchmarked, cost effective model for you, and billing is managed through your Metabase account.`
            }</Text>
            {isLoadingMetabaseManagedAiPricing ? (
              <Group gap="xs" align="center">
                <Skeleton h="1rem" w="14rem" />
                <Skeleton h={14} w={14} circle />
              </Group>
            ) : metabaseManagedAiPricing ? (
              <MetabasePricingText pricing={metabaseManagedAiPricing} />
            ) : null}
          </Stack>

          {match({
            hasDeprecatedMetabaseAiProvider,
            hasMetabaseManagedAiProviderFeature,
            offerMetabaseManagedAi,
            isStoreUser,
          })
            .with(
              {
                hasDeprecatedMetabaseAiProvider: true,
                hasMetabaseManagedAiProviderFeature: false,
                offerMetabaseManagedAi: true,
              },
              () => (
                <Text>
                  {t`You're on legacy tiered AI pricing today. On your next billing cycle, you'll switch to metered AI pricing.`}
                </Text>
              ),
            )
            .with({ hasDeprecatedMetabaseAiProvider: true }, () => null)
            .with({ hasMetabaseManagedAiProviderFeature: true }, () => null)
            .with({ isStoreUser: false }, () => (
              <Text fw="bold">
                {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
                {t`Please ask a Metabase Store Admin${anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`} of your organization to enable this for you.`}
              </Text>
            ))
            .otherwise(() => (
              <Checkbox
                checked={hasAcceptedTerms}
                disabled={isLoading}
                onChange={(event) =>
                  setHasAcceptedTerms(event.currentTarget.checked)
                }
                // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
                label={jt`I agree with the Metabase AI Service ${(
                  <Anchor
                    key="metabase-ai-terms-link"
                    href={METABASE_MANAGED_AI_TERMS_URL}
                    target="_blank"
                  >
                    {t`Terms of Service`}
                  </Anchor>
                )}`}
              />
            ))}
        </>
      )}

      {metabaseManagedAiPurchaseError && (
        <Text size="sm" c="error">
          {metabaseManagedAiPurchaseError}
        </Text>
      )}

      {updateMetabotSettingsError && (
        <Text size="sm" c="error">
          {updateMetabotSettingsError}
        </Text>
      )}

      {removeMetabaseManagedAiError && (
        <Text size="sm" c="error">
          {removeMetabaseManagedAiError}
        </Text>
      )}

      <MetabotSettingUpModal
        isSavingConfiguration={
          isSettingUpModalOpen && updateMetabotSettingsResult.isLoading
        }
        onActivated={handleConnect}
        opened={isSettingUpModalOpen}
        onClose={() => setIsSettingUpModalOpen(false)}
      />
    </>
  );
}

function MetabaseManagedProviderCard({
  isLoadingPricing,
  pricing,
  hasDeprecatedMetabaseAiProvider,
  hasMetabaseManagedAiProviderFeature,
  offerMetabaseManagedAi,
}: {
  isLoadingPricing: boolean;
  pricing: MetabaseManagedAiPricing | null;
  hasDeprecatedMetabaseAiProvider: boolean;
  hasMetabaseManagedAiProviderFeature: boolean;
  offerMetabaseManagedAi: boolean;
}) {
  const { data: metabotUsage } = useGetMetabotUsageQuery();
  const totalCost = getMetabaseUsageCost(metabotUsage?.tokens, pricing);

  return (
    <Stack gap="md">
      {!hasMetabaseManagedAiProviderFeature &&
        hasDeprecatedMetabaseAiProvider &&
        offerMetabaseManagedAi && (
          <Text c="text-secondary">
            {t`You're on legacy tiered AI pricing today. On your next billing cycle, you'll switch to metered AI pricing. If you'd like to switch to a third-party AI provider and use their API, click Disconnect.`}
          </Text>
        )}

      {hasMetabaseManagedAiProviderFeature && (
        <>
          <Text c="text-secondary" lh="1">{t`Current billing cycle`}</Text>
          <MetabaseUsageRow
            label={t`Total tokens`}
            value={formatNumber(metabotUsage?.tokens ?? 0)}
          />
          {isLoadingPricing ? (
            <Flex align="center" justify="space-between" gap="md">
              <Skeleton h="1rem" w="7rem" />
              <Box flex={1} h={1} bg="border" />
              <Skeleton h="1rem" w="8rem" />
            </Flex>
          ) : pricing ? (
            <MetabasePricingRow pricing={pricing} />
          ) : null}
          <MetabaseUsageRow
            label={t`Total cost`}
            value={formatMetabaseCost(totalCost)}
          />
        </>
      )}
    </Stack>
  );
}

function MetabaseUsageRow({ label, value }: { label: string; value: string }) {
  return (
    <Flex align="center" justify="space-between" gap="md">
      <Text lh={1}>{label}</Text>
      <Box
        flex={1}
        h={1}
        style={{
          alignSelf: "end",
          borderBottom: "1px dotted var(--mb-color-border)",
        }}
      />
      <Text lh={1} fw="500">
        {value}
      </Text>
    </Flex>
  );
}

function MetabasePricingRow({
  pricing,
}: {
  pricing: MetabaseManagedAiPricing;
}) {
  return (
    <Flex align="center" justify="space-between" gap="md">
      <Text lh="1">
        <Flex align="center" gap="sm">
          {t`Price per token`}
          <Tooltip
            label={t`Tokens are chunks of text used by AI models. Usage includes both prompts and responses.`}
            multiline
            maw="20rem"
          >
            <UnstyledButton
              aria-label={t`AI pricing details`}
              data-testid="metabase-ai-pricing-details"
              style={{ lineHeight: 0 }}
            >
              <Icon name="info" size={14} c="text-secondary" />
            </UnstyledButton>
          </Tooltip>
        </Flex>
      </Text>
      <Box
        flex={1}
        h={1}
        style={{
          alignSelf: "end",
          borderBottom: "1px dotted var(--mb-color-border)",
        }}
      />
      <Text lh={1} fw="500">
        {t`${pricing.price} per ${pricing.unit} tokens`}
      </Text>
    </Flex>
  );
}

function MetabasePricingText({
  pricing,
}: {
  pricing: MetabaseManagedAiPricing;
}) {
  return (
    <Group gap="xs" align="center">
      <Text lh="1">{t`Price per token - ${pricing.price} per ${pricing.unit} tokens`}</Text>
      <Tooltip
        label={t`Tokens are chunks of text used by AI models. Usage includes both prompts and responses.`}
        multiline
        maw="20rem"
      >
        <UnstyledButton
          aria-label={t`AI pricing details`}
          data-testid="metabase-ai-pricing-details"
          style={{ lineHeight: 0 }}
        >
          <Icon name="info" size={14} c="text-secondary" />
        </UnstyledButton>
      </Tooltip>
    </Group>
  );
}

function getMetabaseUsageCost(
  tokens: number | null | undefined,
  pricing: MetabaseManagedAiPricing | null,
) {
  if (!tokens || !pricing) {
    return 0;
  }

  return (tokens / pricing.unitCount) * pricing.pricePerUnit;
}
