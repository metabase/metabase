import cx from "classnames";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { DottedBackground } from "metabase/data-studio/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/data-studio/upsells/components/LineDecorator";
import type { BillingPeriod } from "metabase/data-studio/upsells/types";
import { useSelector } from "metabase/lib/redux";
import { getStoreUsers } from "metabase/selectors/store-users";
import { getIsHosted } from "metabase/setup/selectors";
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
import { useTransformsBilling } from "metabase-enterprise/transforms/upsells/hooks/useTransformsBilling";

import S from "./TransformsUpsellPage.module.css";
import { PricingSummary } from "./components/PricingSummary";
import { TierSelection, type TransformTier } from "./components/TierSelection";

/**
 * Expected scenarios:
 * - User with basic transforms: show advanced only, upgrade flow
 * - Trial user: show both tiers with radio selection, $0 due today, CTA as "Add to trial"
 * - EE user with no transforms, no trial: show both tiers with radio selection, $X due today, CTA as "Add to plan"
 *   - When trial is available for this add-on, show $0 due today, CTA as "Start trial"
 */
export function TransformsUpsellPage() {
  const bulletPoints = [
    t`Schedule and run transforms as groups with jobs`,
    t`Fast runs with incremental transforms that respond to data changes`,
    t`Predictable costs -  72,000 successful transform runs included every month`,
    t`If you go over your cap, transforms bill at 0.01 per transform run`,
  ];

  const isHosted = useSelector(getIsHosted);
  const { isStoreUser, anyStoreUserEmailAddress } = useSelector(getStoreUsers);

  const [selectedTier, setSelectedTier] = useState<TransformTier>("basic");

  const {
    advancedTransformsAddOn,
    basicTransformsAddOn,
    billingPeriodMonths,
    error,
    hasBasicTransforms,
    isLoading,
    isOnTrial,
    hadTransforms,
  } = useTransformsBilling();

  const hasData =
    billingPeriodMonths !== undefined &&
    (basicTransformsAddOn || advancedTransformsAddOn);
  const billingPeriod: BillingPeriod =
    billingPeriodMonths === 1 ? "monthly" : "yearly";

  const basicTransformsPrice = basicTransformsAddOn?.default_base_fee ?? 0;
  const advancedTransformsPrice =
    advancedTransformsAddOn?.default_base_fee ?? 0;

  /**
   * Single-column layout is used when the user doesn't have authority to
   * purchase the add-on - we just show the information about the feature
   * and a note to ask a store admin to enable it for them.
   * Single-column layout will be displayed when:
   * - Current user is not a store user; or
   * - No billing data available (can't show pricing)
   */
  const showSingleColumn = (isHosted && !isStoreUser) || !hasData;

  useEffect(() => {
    setSelectedTier(hasBasicTransforms ? "advanced" : "basic");
  }, [hasBasicTransforms]);

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

  const rightColumnTitle = getRightColumnTitle(
    isOnTrial,
    hasBasicTransforms,
    availableTrialDays,
  );
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
            className={cx(S.container, { [S.singleColumn]: showSingleColumn })}
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
              {bulletPoints && bulletPoints.length > 0 && (
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
              )}
              {showSingleColumn && (
                <Text fw="bold">
                  {anyStoreUserEmailAddress
                    ? // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                      t`Please ask a Metabase Store Admin (${anyStoreUserEmailAddress}) to enable this for you.`
                    : // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
                      t`Please ask a Metabase Store Admin to enable this for you.`}
                </Text>
              )}
            </Stack>
            {!showSingleColumn && (
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
                    showAdvancedOnly={hasBasicTransforms}
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
  hasBasicTransforms: boolean,
  availableTrialDays: number,
) => {
  switch (true) {
    case isOnTrial && hasBasicTransforms:
      return t`Add advanced transforms to your trial`;
    case isOnTrial:
      return t`Add transforms to your trial`;
    case availableTrialDays > 0 && hasBasicTransforms:
      return t`Start a free ${availableTrialDays}-day trial of Python transforms`;
    case availableTrialDays > 0:
      return t`Start a free ${availableTrialDays}-day trial of transforms`;
    case hasBasicTransforms:
      return t`Add advanced transforms to your plan`;
    default:
      return t`Add transforms to your plan`;
  }
};
