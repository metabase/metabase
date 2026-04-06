import { useState } from "react";
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

import { useGetMetabotUsageQuery } from "../../../api";
import { formatMetabaseCost } from "../../format";
import { useMetabotAiPricing } from "../../useMetabotAiPricing";
import { usePurchaseMetabotAi } from "../../usePurchaseMetabotAi";

import { MetabotSettingUpModal } from "./MetabotSettingUpModal";

const METABASE_AI_PROVIDER_FEATURE = "metabase-ai-managed";
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
      await metabotAiPurchase.purchaseMetabotAi(hasAcceptedTerms);
    } catch {
      setIsSettingUpModalOpen(false);
    }
  };

  return (
    <>
      {isMetabaseProviderConnected ? (
        <MetabaseManagedProviderCard metabasePricing={metabasePricing} />
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
            {metabasePricing && (
              <MetabasePricingText metabasePricing={metabasePricing} />
            )}
          </Stack>

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
        onActivated={onConnect}
        opened={isSettingUpModalOpen}
        onClose={() => setIsSettingUpModalOpen(false)}
      />
    </>
  );
}

function MetabaseManagedProviderCard({
  metabasePricing,
}: {
  metabasePricing: {
    price: string;
    unit: string;
    pricePerUnit: number;
    unitCount: number;
  } | null;
}) {
  const { data: metabotUsage } = useGetMetabotUsageQuery();
  const totalCost = getMetabaseUsageCost(metabotUsage?.tokens, metabasePricing);

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

        {metabasePricing && (
          <MetabasePricingRow metabasePricing={metabasePricing} />
        )}

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
        {t`${metabasePricing.price} per ${metabasePricing.unit} tokens`}
      </Text>
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
      <Text lh="1">{t`Price per token - ${metabasePricing.price} per ${metabasePricing.unit} tokens`}</Text>
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
  pricing: {
    price: string;
    unit: string;
    pricePerUnit: number;
    unitCount: number;
  } | null,
) {
  if (!tokens || !pricing) {
    return 0;
  }

  return (tokens / pricing.unitCount) * pricing.pricePerUnit;
}
