import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { DottedBackground } from "metabase/data-studio/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/data-studio/upsells/components/LineDecorator";
import type { BillingPeriod } from "metabase/data-studio/upsells/types";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import {
  Card,
  Center,
  Divider,
  Flex,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { useTransformsBilling } from "../../hooks/useTransformsBilling";

import S from "./TransformsUpsellPage.module.css";
import { PricingSummary } from "./components/PricingSummary";
import { TierSelection, type TransformTier } from "./components/TierSelection";

/**
 * Expected scenarios:
 * - Trial user with no transforms: show both tiers with radio selection, $0 due today, CTA as "Add to trial"
 * - EE user with no transforms, no trial: show both tiers with radio selection, $X due today, CTA as "Add to plan"
 *   - When trial is available for this add-on, show $0 due today, CTA as "Start trial"
 *
 * Note: this upsell page should only be displayed to cloud customers since OSS and Self-hosted have
 * transforms enabled by default.
 */
export function TransformsUpsellPage() {
  const bulletPoints = [
    t`Schedule and run transforms as groups with jobs`,
    t`Fast runs with incremental transforms that respond to data changes`,
    t`Predictable costs -  72,000 successful transform runs included every month`,
    t`If you go over your cap, transforms bill at 0.01 per transform run`,
  ];

  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const [selectedTier, setSelectedTier] = useState<TransformTier>("basic");

  const {
    advancedTransformsAddOn,
    basicTransformsAddOn,
    billingPeriodMonths,
    error,
    hadTransforms,
    isLoading,
    isOnTrial,
  } = useTransformsBilling();

  const hasData =
    billingPeriodMonths !== undefined &&
    (basicTransformsAddOn || advancedTransformsAddOn);
  const billingPeriod: BillingPeriod =
    billingPeriodMonths === 1 ? "monthly" : "yearly";

  const basicTransformsPrice = basicTransformsAddOn?.default_base_fee ?? 0;
  const advancedTransformsPrice =
    advancedTransformsAddOn?.default_base_fee ?? 0;

  const canUserPurchase = hasData && isStoreUser;

  if (error || isLoading) {
    return (
      <DottedBackground px="3.5rem" pb="2rem">
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
          }
        />
        <Center h="100%" bg="background-secondary">
          <LoadingAndErrorWrapper
            loading={isLoading}
            error={
              error
                ? t`Error fetching information about available add-ons.`
                : null
            }
          />
        </Center>
      </DottedBackground>
    );
  }

  let availableTrialDays =
    selectedTier === "basic"
      ? (basicTransformsAddOn?.trial_days ?? 0)
      : (advancedTransformsAddOn?.trial_days ?? 0);

  if (hadTransforms) {
    availableTrialDays = 0;
  }

  const rightColumnTitle = getRightColumnTitle(isOnTrial, availableTrialDays);
  const selectTierPrice =
    selectedTier === "basic" ? basicTransformsPrice : advancedTransformsPrice;
  const dueTodayAmount =
    availableTrialDays > 0 || isOnTrial ? 0 : selectTierPrice;

  return (
    <DottedBackground px="3.5rem" pb="2rem">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Transforms`}</DataStudioBreadcrumbs>
        }
      />
      <Flex
        align="flex-start"
        className={S.UpsellPageContent}
        justify="center"
        py="xl"
      >
        <LineDecorator>
          <Card
            className={cx(S.container, { [S.singleColumn]: !canUserPurchase })}
            withBorder
          >
            <Stack gap="lg" className={S.leftColumn} p="xl">
              <Title order={2}>
                {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
                {t`Start transforming your data in Metabase`}
              </Title>
              <Text c="text-secondary">
                {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins. */}
                {t`Clean up, reshape, and reuse data directly in Metabase. Add transforms to build models your whole team can use.`}
              </Text>
              <Stack gap="lg" py="sm">
                {bulletPoints.map((point) => (
                  <Flex direction="row" gap="sm" key={point}>
                    <Center w={24} h={24}>
                      <Icon name="check_filled" size={16} c="text-brand" />
                    </Center>
                    <Text c="text-secondary">{point}</Text>
                  </Flex>
                ))}
              </Stack>
              {!canUserPurchase && (
                <Text fw="bold">
                  {anyStoreUserEmailAddress
                    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                      t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to enable this for you.`
                    : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                      t`Please ask a Metabase Store Admin to enable this for you.`}
                </Text>
              )}
            </Stack>
            {canUserPurchase && (
              <>
                <Divider orientation="vertical" />
                <Stack gap="lg" className={S.rightColumn} p="xl">
                  <Title order={3}>{rightColumnTitle}</Title>
                  <TierSelection
                    advancedTransformsPrice={advancedTransformsPrice}
                    basicTransformsPrice={basicTransformsPrice}
                    billingPeriod={billingPeriod}
                    selectedTier={selectedTier}
                    setSelectedTier={setSelectedTier}
                  />
                  <PricingSummary
                    dueTodayAmount={dueTodayAmount}
                    isOnTrial={isOnTrial}
                    selectedTier={selectedTier}
                  />
                </Stack>
              </>
            )}
          </Card>
        </LineDecorator>
      </Flex>
    </DottedBackground>
  );
}

// Determine the title based on scenario
const getRightColumnTitle = (
  isOnTrial: boolean,
  availableTrialDays: number,
) => {
  if (isOnTrial) {
    return t`Add transforms to your trial`;
  }

  if (availableTrialDays > 0) {
    return t`Start a free ${availableTrialDays}-day trial of transforms`;
  }

  return t`Add transforms to your plan`;
};
