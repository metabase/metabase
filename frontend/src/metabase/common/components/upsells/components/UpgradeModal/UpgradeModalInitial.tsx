import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import {
  Anchor,
  Box,
  Button,
  Divider,
  Flex,
  Icon,
  List,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { UpsellGem } from "../UpsellGem";

import type { UpgradeFlow } from "./types";

// Strip cents from price strings like "$575.00" → "$575"
function formatPriceNoCents(price: string): string {
  return price.replace(/\.00$/, "");
}

interface PlanPricing {
  price: string;
  includedUsers: number;
  pricePerAdditionalUser: string;
  billingPeriodMonths: number;
}

interface UpgradeModalInitialProps {
  flow: UpgradeFlow;
  dueToday: string;
  showPlanPricing?: boolean;
  planPricing?: PlanPricing;
  onCancel: () => void;
  onConfirm: () => void;
}

export function UpgradeModalInitial({
  flow,
  dueToday,
  showPlanPricing,
  planPricing,
  onCancel,
  onConfirm,
}: UpgradeModalInitialProps) {
  const isTrial = flow === "trial";
  const title = isTrial
    ? t`Start your 14-day trial of Pro`
    : t`Upgrade to Metabase Pro`;
  const buttonText = isTrial ? t`Start your free trial` : t`Upgrade to Pro`;
  const proFeatures = [
    t`Whitelabeling`,
    t`Advanced Permissions`,
    t`Usage Analytics, and more`,
  ];

  return (
    <Stack gap="lg">
      <Flex align="center" gap="sm">
        <UpsellGem size={24} />
        <Title order={2}>{title}</Title>
      </Flex>

      <Box
        bg="background-secondary"
        p="lg"
        style={{ borderRadius: "var(--mantine-radius-md)" }}
      >
        <Stack gap="md">
          <Flex justify="space-between" align="center">
            <Title order={4}>{t`Metabase Pro`}</Title>
            <ExternalLink href="https://www.metabase.com/pricing">
              <Anchor component="span">{t`See all features`}</Anchor>
            </ExternalLink>
          </Flex>

          <List
            spacing="xs"
            icon={<Icon name="check" c="text-primary" size={16} />}
            pl={0}
          >
            {proFeatures.map((feature) => (
              <List.Item key={feature}>
                <Text c="text-secondary">{feature}</Text>
              </List.Item>
            ))}
          </List>

          <Divider />

          <Stack gap="xs">
            <Flex justify="space-between" align="center">
              <Text c="text-secondary">{t`Due today:`}</Text>
              <Text fw="bold" size="lg">
                {dueToday}
              </Text>
            </Flex>
            {showPlanPricing && planPricing && (
              <Flex justify="space-between" align="flex-start">
                <Text c="text-secondary">{t`After your trial ends:`}</Text>
                <Stack gap={0} align="flex-end">
                  <Text fw="bold" size="md">
                    {planPricing.billingPeriodMonths === 12
                      ? t`${formatPriceNoCents(planPricing.price)}/year + tax`
                      : t`${formatPriceNoCents(planPricing.price)}/mo + tax`}
                  </Text>
                  <Text c="text-secondary" size="sm">
                    {planPricing.billingPeriodMonths === 12
                      ? t`Incl. ${planPricing.includedUsers} users, then ${formatPriceNoCents(planPricing.pricePerAdditionalUser)}/user/year`
                      : t`Incl. ${planPricing.includedUsers} users, then ${formatPriceNoCents(planPricing.pricePerAdditionalUser)}/user/mo`}
                  </Text>
                </Stack>
              </Flex>
            )}
          </Stack>
        </Stack>
      </Box>

      {isTrial && (
        <Text c="text-secondary">
          {t`After your free trial ends, we won't charge you automatically – you decide if you'd like to keep the Pro plan.`}
        </Text>
      )}

      <Flex justify="flex-end" gap="md">
        <Button variant="subtle" onClick={onCancel}>
          {t`Cancel`}
        </Button>
        <Button variant="filled" color="brand" onClick={onConfirm}>
          {buttonText}
        </Button>
      </Flex>
    </Stack>
  );
}
