import { useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import { formatNumber } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
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
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useGetMetabotUsageQuery } from "../../../api";
import {
  METABASE_MANAGED_AI_FEATURE,
  METABASE_MANAGED_AI_TERMS_URL,
} from "../../constants";
import { formatMetabaseCost } from "../../format";
import {
  type MetabaseManagedAiPricing,
  useMetabaseManagedAiPricing,
} from "../../useMetabaseManagedAiPricing";
import { usePurchaseMetabaseManagedAi } from "../../usePurchaseMetabaseManagedAi";

import { MetabotSettingUpModal } from "./MetabotSettingUpModal";

type MetabaseAIProviderSetupProps = {
  isMetabaseProviderConnected: boolean;
  isSavingMetabaseConnection: boolean;
  onConnect: () => Promise<void>;
};

export function MetabaseAIProviderSetup({
  isMetabaseProviderConnected,
  isSavingMetabaseConnection,
  onConnect,
}: MetabaseAIProviderSetupProps) {
  const llmProxyConfigured = useSetting("llm-proxy-configured?");
  const hasMetabaseManagedAiProviderFeature = !!hasPremiumFeature(
    METABASE_MANAGED_AI_FEATURE,
  );
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const {
    pricing: metabaseManagedAiPricing,
    isLoading: isLoadingMetabaseManagedAiPricing,
  } = useMetabaseManagedAiPricing(!!llmProxyConfigured);

  const metabaseManagedAiPurchase = usePurchaseMetabaseManagedAi();

  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isSettingUpModalOpen, setIsSettingUpModalOpen] = useState(false);

  const metabaseManagedAiPurchaseError = metabaseManagedAiPurchase.error
    ? getErrorMessage(
        metabaseManagedAiPurchase.error,
        t`Unable to connect to this AI provider.`,
      )
    : undefined;

  const handleMetabasePurchase = async () => {
    setIsSettingUpModalOpen(true);

    try {
      await metabaseManagedAiPurchase.purchaseMetabaseManagedAi(
        hasAcceptedTerms,
      );
    } catch {
      setIsSettingUpModalOpen(false);
    }
  };

  return (
    <>
      {isMetabaseProviderConnected ? (
        <MetabaseManagedProviderCard
          isLoadingPricing={isLoadingMetabaseManagedAiPricing}
          pricing={metabaseManagedAiPricing}
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
            hasMetabaseManagedAiProviderFeature,
            isStoreUser,
          })
            .with({ hasMetabaseManagedAiProviderFeature: true }, () => (
              <Button
                loading={isSavingMetabaseConnection}
                onClick={onConnect}
              >{t`Connect`}</Button>
            ))
            .with({ isStoreUser: false }, () => (
              <Text fw="bold">
                {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
                {t`Please ask a Metabase Store Admin${anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`} of your organization to enable this for you.`}
              </Text>
            ))
            .otherwise(() => (
              <Stack gap="sm">
                <Checkbox
                  checked={hasAcceptedTerms}
                  onChange={(event) =>
                    setHasAcceptedTerms(event.currentTarget.checked)
                  }
                  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
                  label={jt`I agree with the Metabase AI add-on ${(
                    <Anchor
                      key="metabase-ai-terms-link"
                      href={METABASE_MANAGED_AI_TERMS_URL}
                      target="_blank"
                    >
                      {t`Terms of Service`}
                    </Anchor>
                  )}`}
                />
                <Button
                  disabled={!hasAcceptedTerms}
                  loading={
                    metabaseManagedAiPurchase.isLoading || isSettingUpModalOpen
                  }
                  onClick={handleMetabasePurchase}
                >{t`Connect`}</Button>
              </Stack>
            ))}
        </>
      )}

      {metabaseManagedAiPurchaseError && (
        <Text size="sm" c="error">
          {metabaseManagedAiPurchaseError}
        </Text>
      )}

      <MetabotSettingUpModal
        isSavingConfiguration={
          isSettingUpModalOpen && isSavingMetabaseConnection
        }
        onActivated={onConnect}
        opened={isSettingUpModalOpen}
        onClose={() => setIsSettingUpModalOpen(false)}
      />
    </>
  );
}

function MetabaseManagedProviderCard({
  isLoadingPricing,
  pricing,
}: {
  isLoadingPricing: boolean;
  pricing: MetabaseManagedAiPricing | null;
}) {
  const { data: metabotUsage } = useGetMetabotUsageQuery();
  const totalCost = getMetabaseUsageCost(metabotUsage?.tokens, pricing);

  return (
    <Stack gap="lg">
      <Group align="flex-start" gap="md" wrap="nowrap">
        <Title order={4}>{
          // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
          t`Connected to Metabase AI service`
        }</Title>
      </Group>

      <Stack gap="md">
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
      </Stack>
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
