import { useState } from "react";
import { jt, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import { formatDateTimeWithUnit, formatNumber } from "metabase/lib/formatting";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import {
  Anchor,
  Button,
  Card,
  Checkbox,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import type { MetabotUsageQuota } from "../../../api";
import { useGetMetabotUsageQuery } from "../../../api";
import { useMetabotAiPricing } from "../../useMetabotAiPricing";
import { usePurchaseMetabotAi } from "../../usePurchaseMetabotAi";

import { MetabotSettingUpModal } from "./MetabotSettingUpModal";

const METABASE_AI_PROVIDER_FEATURE = "metabase-ai-provider";
const METABASE_HOSTING_TERMS_URL = "https://www.metabase.com/license/hosting";

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
  const isHosted = useSetting("is-hosted?");
  const llmProxyConfigured = useSetting("llm-proxy-configured?");
  const shouldLoadMetabaseBilling = !!llmProxyConfigured && isHosted;
  const hasMetabaseAiProviderFeature = !!hasPremiumFeature(
    METABASE_AI_PROVIDER_FEATURE,
  );
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const metabasePricing = useMetabotAiPricing(shouldLoadMetabaseBilling);
  const { data: metabotUsage } = useGetMetabotUsageQuery(undefined, {
    skip: !shouldLoadMetabaseBilling,
  });
  const metabotAiPurchase = usePurchaseMetabotAi(shouldLoadMetabaseBilling);

  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isSettingUpModalOpen, setIsSettingUpModalOpen] = useState(false);

  const metabotPurchaseError = metabotAiPurchase.error
    ? getErrorMessage(
        metabotAiPurchase.error,
        t`Unable to connect to this AI provider.`,
      )
    : undefined;

  const handleMetabasePurchase = async () => {
    setIsSettingUpModalOpen(true);

    try {
      await metabotAiPurchase.purchaseMetabotAi();
    } catch {
      setIsSettingUpModalOpen(false);
    }
  };

  return (
    <>
      {isMetabaseProviderConnected ? (
        <MetabaseManagedProviderCard
          metabasePricing={metabasePricing}
          metabotUsageQuotas={metabotUsage?.quotas ?? null}
        />
      ) : (
        <>
          <Card withBorder>
            <Stack gap="md">
              <Title order={4}>{
                // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
                t`About Metabase AI service`
              }</Title>
              <Text>{
                // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
                t`The simplest way to get started with AI in Metabase. We pick a benchmarked, cost effective model for you, and billing is managed through your Metabase account.`
              }</Text>
              {metabasePricing && (
                <MetabasePricingText metabasePricing={metabasePricing} />
              )}
            </Stack>
          </Card>

          {!hasMetabaseAiProviderFeature ? (
            !isStoreUser ? (
              <Text fw="bold">
                {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
                {t`Please ask a Metabase Store Admin${anyStoreUserEmailAddress && ` (${anyStoreUserEmailAddress})`} of your organization to enable this for you.`}
              </Text>
            ) : (
              <>
                <Card
                  bg="background-secondary"
                  p="sm"
                  radius="md"
                  shadow="none"
                >
                  <Checkbox
                    checked={hasAcceptedTerms}
                    onChange={(event) =>
                      setHasAcceptedTerms(event.currentTarget.checked)
                    }
                    label={jt`I agree with the Metabot AI add-on ${(
                      <Anchor
                        key="metabot-ai-terms-link"
                        href={METABASE_HOSTING_TERMS_URL}
                        target="_blank"
                      >
                        {t`Terms of Service`}
                      </Anchor>
                    )}`}
                  />
                </Card>
                <Button
                  disabled={!hasAcceptedTerms}
                  loading={metabotAiPurchase.isLoading || isSettingUpModalOpen}
                  onClick={handleMetabasePurchase}
                >{t`Connect`}</Button>
              </>
            )
          ) : (
            <Button
              loading={isSavingMetabaseConnection}
              onClick={onConnect}
            >{t`Connect`}</Button>
          )}
        </>
      )}

      {metabotPurchaseError && (
        <Text size="sm" c="error">
          {metabotPurchaseError}
        </Text>
      )}

      <MetabotSettingUpModal
        isSavingConfiguration={
          isSettingUpModalOpen && isSavingMetabaseConnection
        }
        opened={isSettingUpModalOpen}
        onClose={() => setIsSettingUpModalOpen(false)}
      />
    </>
  );
}

function MetabaseManagedProviderCard({
  metabasePricing,
  metabotUsageQuotas,
}: {
  metabasePricing: {
    price: string;
    unit: string;
    pricePerUnit: number;
    unitCount: number;
  } | null;
  metabotUsageQuotas: MetabotUsageQuota[] | null;
}) {
  const metabaseUsageQuota = getMetabaseUsageQuota(metabotUsageQuotas);
  const totalCost = getMetabaseUsageCost(metabaseUsageQuota, metabasePricing);

  return (
    <Card withBorder>
      <Stack gap="lg">
        <Group align="flex-start" gap="md" wrap="nowrap">
          <Flex
            align="center"
            justify="center"
            bg="success"
            c="white"
            w={32}
            h={32}
            style={{ borderRadius: 999 }}
          >
            <Icon name="check" size={16} />
          </Flex>

          <Stack gap="xs">
            <Title order={4}>{
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
              t`Metabase AI service is connected`
            }</Title>
            <Text c="text-secondary">{
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
              t`Metabase is managing model selection and billing for you, so you do not need to configure an API key or choose a model.`
            }</Text>
          </Stack>
        </Group>

        <Stack gap="sm">
          <MetabaseUsageRow
            label={t`Current billing cycle`}
            value={formatMetabaseBillingCycle(metabaseUsageQuota?.updated_at)}
          />
          <MetabaseUsageRow
            label={t`Total tokens`}
            value={formatNumber(metabaseUsageQuota?.usage ?? 0)}
          />
          {metabasePricing && (
            <MetabasePricingText metabasePricing={metabasePricing} />
          )}
          <MetabaseUsageRow
            label={t`Total cost for this billing cycle`}
            value={formatMetabaseCost(totalCost)}
          />
          <MetabaseTermsText secondary />
        </Stack>
      </Stack>
    </Card>
  );
}

function MetabaseUsageRow({ label, value }: { label: string; value: string }) {
  return (
    <Flex align="center" justify="space-between" gap="md">
      <Text c="text-secondary">{label}</Text>
      <Text fw="500">{value}</Text>
    </Flex>
  );
}

function MetabasePricingText({
  metabasePricing,
}: {
  metabasePricing: {
    price: string;
    unit: string;
    pricePerUnit: number;
    unitCount: number;
  };
}) {
  return (
    <Group gap="xs" align="center">
      <Text>{t`Price per token - ${metabasePricing.price} per ${metabasePricing.unit} tokens`}</Text>
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

function MetabaseTermsText({ secondary = false }: { secondary?: boolean }) {
  return (
    <Text c={secondary ? "text-secondary" : undefined}>
      {
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase AI service
        jt`Usage of the Metabase AI service is governed by the ${(
          <Anchor
            key="metabase-ai-terms-link"
            href={METABASE_HOSTING_TERMS_URL}
            target="_blank"
          >
            {t`terms of service`}
          </Anchor>
        )}.`
      }
    </Text>
  );
}

function getMetabaseUsageQuota(quotas: MetabotUsageQuota[] | null) {
  return quotas?.find((quota) =>
    quota.hosting_feature?.startsWith("metabase-ai"),
  );
}

function getMetabaseUsageCost(
  quota: MetabotUsageQuota | undefined,
  pricing: {
    price: string;
    unit: string;
    pricePerUnit: number;
    unitCount: number;
  } | null,
) {
  if (!quota || !pricing) {
    return 0;
  }

  return (quota.usage / pricing.unitCount) * pricing.pricePerUnit;
}

function formatMetabaseBillingCycle(updatedAt?: string) {
  if (!updatedAt) {
    return t`Unavailable`;
  }

  const dow = formatDateTimeWithUnit(updatedAt, "day-of-week");
  const day = formatDateTimeWithUnit(updatedAt, "day");
  return `${dow}, ${day}`;
}

function formatMetabaseCost(value: number) {
  return formatNumber(value, {
    currency: "USD",
    number_style: "currency",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
