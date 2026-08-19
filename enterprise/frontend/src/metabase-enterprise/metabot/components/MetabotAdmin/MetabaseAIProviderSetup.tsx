import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  useCreateLlmProviderMutation,
  useRefreshTokenStatusMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { getUserIsAdmin } from "metabase/current-user";
import { MetabotManagedProviderLimitActions } from "metabase/metabot/components/MetabotManagedProviderLimit";
import type { MetabaseAIProviderSetupProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import {
  Anchor,
  Box,
  Button,
  Checkbox,
  Flex,
  Group,
  Icon,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";
import {
  type MetabotUsageResponse,
  useGetMetabotUsageQuery,
} from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  METABASE_MANAGED_AI_FEATURE,
  METABASE_MANAGED_AI_TERMS_URL,
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

export function hasMetabaseManagedProviderDetails() {
  return (
    !!hasPremiumFeature(METABASE_MANAGED_AI_FEATURE) ||
    (!!hasPremiumFeature(METABOT_V3_FEATURE) &&
      !!hasPremiumFeature(OFFER_METABASE_MANAGED_AI_FEATURE))
  );
}

export function MetabaseAIProviderSetup({
  onConnect,
  onCancel,
  isConnected,
}: MetabaseAIProviderSetupProps) {
  const offerMetabaseManagedAi = !!hasPremiumFeature(
    OFFER_METABASE_MANAGED_AI_FEATURE,
  );
  const hasMetabaseManagedAiProviderFeature = !!hasPremiumFeature(
    METABASE_MANAGED_AI_FEATURE,
  );
  const hasDeprecatedMetabaseAiProvider =
    !!hasPremiumFeature(METABOT_V3_FEATURE);
  const isMetabotConfigured = !!useSetting("llm-metabot-configured?");
  const isConfigured = isConnected ?? isMetabotConfigured;

  const isAdmin = useSelector(getUserIsAdmin);

  const [createLlmProvider, createLlmProviderResult] =
    useCreateLlmProviderMutation();

  const handleConnect = useCallback(async () => {
    await createLlmProvider({ type: "metabase" }).unwrap();
    onConnect?.();
  }, [onConnect, createLlmProvider]);

  const {
    pricing: metabaseManagedAiPricing,
    isLoading: isLoadingMetabaseManagedAiPricing,
  } = useMetabaseManagedAiPricing(
    !hasDeprecatedMetabaseAiProvider || hasMetabaseManagedAiProviderFeature,
  );

  const metabaseManagedAiPurchase = usePurchaseMetabaseManagedAi();
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isSettingUpModalOpen, setIsSettingUpModalOpen] = useState(false);

  const handleMetabasePurchase = useCallback(async () => {
    setIsSettingUpModalOpen(true);

    try {
      await metabaseManagedAiPurchase.purchaseMetabaseManagedAi(
        hasAcceptedTerms,
      );
      await handleConnect();
    } catch {
      setIsSettingUpModalOpen(false);
    }
  }, [handleConnect, hasAcceptedTerms, metabaseManagedAiPurchase]);

  const connectAction = match({
    hasMetabaseManagedAiProviderFeature,
    hasDeprecatedMetabaseAiProvider,
    isConfigured,
    isAdmin,
  })
    .with({ isConfigured: true }, () => null)
    .with({ hasMetabaseManagedAiProviderFeature: true }, () => handleConnect)
    .with({ hasDeprecatedMetabaseAiProvider: true }, () => handleConnect)
    .with({ isAdmin: false }, () => null)
    .otherwise(() => handleMetabasePurchase);

  const needsTermsAcceptance =
    connectAction === handleMetabasePurchase && !hasAcceptedTerms;

  const isMutating =
    createLlmProviderResult.isLoading || metabaseManagedAiPurchase.isLoading;

  const metabaseManagedAiPurchaseError = metabaseManagedAiPurchase.error
    ? getErrorMessage(
        metabaseManagedAiPurchase.error,
        t`Unable to connect to this AI provider.`,
      )
    : undefined;

  const createLlmProviderError = createLlmProviderResult.error
    ? getErrorMessage(
        createLlmProviderResult.error,
        t`Unable to connect to this AI provider.`,
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
            <Text>{
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
              t`The simplest way to get started with AI in Metabase. We pick a benchmarked, cost effective model for you, and billing is managed through your Metabase account.`
            }</Text>
            {isLoadingMetabaseManagedAiPricing ? (
              <PricingCallout>
                <Skeleton h="1rem" w="14rem" />
                <Skeleton h="1rem" w="18rem" />
              </PricingCallout>
            ) : metabaseManagedAiPricing ? (
              <MetabasePricingText pricing={metabaseManagedAiPricing} />
            ) : null}
          </Stack>

          {match({
            hasDeprecatedMetabaseAiProvider,
            hasMetabaseManagedAiProviderFeature,
            offerMetabaseManagedAi,
            isAdmin,
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
            .with({ isAdmin: false }, () => (
              <Text fw="bold">
                {t`Please ask an Admin user to enable this for you.`}
              </Text>
            ))
            .otherwise(() => (
              <Checkbox
                checked={hasAcceptedTerms}
                disabled={isMutating}
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

          {(onCancel || connectAction) && (
            <Flex justify="end">
              <Group gap="sm">
                {onCancel && (
                  <Button disabled={isMutating} onClick={onCancel}>
                    {t`Back`}
                  </Button>
                )}
                {connectAction && (
                  <Button
                    variant="filled"
                    loading={isMutating}
                    disabled={isMutating || needsTermsAcceptance}
                    onClick={connectAction}
                  >
                    {t`Connect`}
                  </Button>
                )}
              </Group>
            </Flex>
          )}
        </>
      )}

      {metabaseManagedAiPurchaseError && (
        <Text size="sm" c="feedback-negative">
          {metabaseManagedAiPurchaseError}
        </Text>
      )}

      {createLlmProviderError && (
        <Text size="sm" c="feedback-negative">
          {createLlmProviderError}
        </Text>
      )}

      <MetabotSettingUpModal
        isSavingConfiguration={
          isSettingUpModalOpen &&
          (createLlmProviderResult.isLoading ||
            metabaseManagedAiPurchase.isLoading)
        }
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
  const isLocked = metabotUsage?.is_locked;
  const totalCost = getMetabaseUsageCost(metabotUsage, pricing);
  const [refreshTokenStatus] = useRefreshTokenStatusMutation();
  useEffect(() => {
    refreshTokenStatus();
  }, [refreshTokenStatus]);

  const freeTokens = metabotUsage?.free_tokens ?? 0;
  const tokens = metabotUsage?.tokens ?? 0;
  const hasFreeTokens = freeTokens > 0 && tokens <= freeTokens;

  return (
    <Stack gap="md">
      {!hasMetabaseManagedAiProviderFeature &&
        hasDeprecatedMetabaseAiProvider &&
        offerMetabaseManagedAi && (
          <Text c="text-secondary">
            {t`You're on legacy tiered AI pricing today. On your next billing cycle, you'll switch to metered AI pricing. If you'd like to switch to a third-party AI provider and use their API, click Disconnect.`}
          </Text>
        )}

      {match({
        hasMetabaseManagedAiProviderFeature,
        isLocked,
        hasFreeTokens,
      })
        .with({ hasMetabaseManagedAiProviderFeature: false }, () => null)
        .with({ isLocked: true }, () => (
          <Flex direction="column" gap="xs">
            <Text c="text-primary" fw={500} lh={1.4}>
              {t`You've run out of AI service tokens`}
            </Text>
            <Text c="text-secondary" fz="sm" lh={1.4}>
              {t`You've used all of your included AI service tokens. To keep using AI features you can either end your trial early and start your subscription, or stay in the trial and add your own AI provider API key.`}
            </Text>
            <MetabotManagedProviderLimitActions inline mt="sm" />
          </Flex>
        ))
        .with(
          { hasMetabaseManagedAiProviderFeature: true, hasFreeTokens: true },
          () => (
            <>
              <Text c="text-secondary" lh="1">{t`Included use`}</Text>
              <MetabaseUsageRow
                label={t`Free trial tokens`}
                value={`${formatNumber(tokens)} / ${formatNumber(freeTokens)}`}
              />
              {!isLoadingPricing && pricing ? (
                <MetabasePricingRow
                  pricing={pricing}
                  label={t`Price per token afterward`}
                />
              ) : (
                <Flex align="center" justify="space-between" gap="md">
                  <Skeleton h="1rem" w="7rem" />
                  <Box flex={1} h={1} bg="border-neutral" />
                  <Skeleton h="1rem" w="8rem" />
                </Flex>
              )}
            </>
          ),
        )
        .with(
          { hasMetabaseManagedAiProviderFeature: true, hasFreeTokens: false },
          () => (
            <>
              <Text c="text-secondary" lh="1">{t`Current billing cycle`}</Text>
              <MetabaseUsageRow
                label={t`Total tokens`}
                value={formatNumber(tokens)}
              />
              {!isLoadingPricing && pricing ? (
                <MetabasePricingRow pricing={pricing} />
              ) : (
                <Flex align="center" justify="space-between" gap="md">
                  <Skeleton h="1rem" w="7rem" />
                  <Box flex={1} h={1} bg="border-neutral" />
                  <Skeleton h="1rem" w="8rem" />
                </Flex>
              )}
              <MetabaseUsageRow
                label={t`Total cost`}
                value={formatMetabaseCost(totalCost)}
              />
            </>
          ),
        )
        .exhaustive()}
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
          borderBottom: "1px dotted var(--mb-color-border-neutral)",
        }}
      />
      <Text lh={1} fw="500">
        {value}
      </Text>
    </Flex>
  );
}

function MetabasePricingRow({
  label,
  pricing,
}: {
  label?: string;
  pricing: MetabaseManagedAiPricing;
}) {
  return (
    <Flex align="center" justify="space-between" gap="md">
      <Text lh="1">
        <Flex align="center" gap="sm">
          {label ?? t`Price per token`}
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
          borderBottom: "1px dotted var(--mb-color-border-neutral)",
        }}
      />
      <Text lh={1} fw="500">
        {t`${pricing.price} per ${pricing.unit} tokens`}
      </Text>
    </Flex>
  );
}

function PricingCallout({ children }: { children: ReactNode }) {
  return (
    <Stack gap="xs" bg="background-secondary" p="md" bdrs="md">
      {children}
    </Stack>
  );
}

export function MetabasePricingText({
  pricing,
}: {
  pricing: MetabaseManagedAiPricing;
}) {
  return (
    <PricingCallout>
      {pricing.freeUnits && (
        <Text fw="bold" lh="1">
          {t`You get ${pricing.freeUnits} tokens for free.`}
        </Text>
      )}
      <Group gap="xs" align="center">
        <Text lh="1">
          {pricing.freeUnits
            ? t`Price per token afterward - ${pricing.price} per ${pricing.unit} tokens`
            : t`Price per token - ${pricing.price} per ${pricing.unit} tokens`}
        </Text>
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
    </PricingCallout>
  );
}

export function getMetabaseUsageCost(
  usage: MetabotUsageResponse | undefined,
  pricing: MetabaseManagedAiPricing | null,
) {
  if (!usage || !pricing) {
    return 0;
  }

  const { tokens, free_tokens: freeTokens } = usage;
  if (!tokens) {
    return 0;
  }

  return (
    (Math.max(0, tokens - (freeTokens ?? 0)) / pricing.unitCount) *
    pricing.pricePerUnit
  );
}
