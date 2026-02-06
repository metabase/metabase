import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { DottedBackground } from "metabase/data-studio/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/data-studio/upsells/components/LineDecorator";
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
import type { BillingPeriod } from "metabase-enterprise/data-studio/upsells/utils";

import { useTransformsBilling } from "../../hooks/useTransformsBilling";

import S from "./TransformsUpsellPage.module.css";
import { PricingSummary } from "./components/PricingSummary";
import { TierSelection, type TransformTier } from "./components/TierSelection";

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
    isLoading,
    error,
    billingPeriodMonths,
    transformsProduct,
    pythonProduct,
    isOnTrial,
    trialEndDate,
    hasBasicTransforms,
  } = useTransformsBilling();

  const hasData =
    billingPeriodMonths !== undefined && (transformsProduct || pythonProduct);
  const billingPeriod: BillingPeriod =
    billingPeriodMonths === 1 ? "monthly" : "yearly";
  // Determine which scenario we're in:
  // - Trial user: show advanced only, $0 due today, "Add to trial"
  // - User with basic transforms: show advanced only, upgrade flow
  // - Regular user: show both tiers with radio selection
  //
  // TODO: There is also the case where the user is on a starter plan (no trial),
  // but hasn't purchased any transforms add-on yet - the way HM works is that, if
  // an add-on hasn't been purchased in the past, the first activation will be a 14
  // day trial, but we currently don't have any way to ask HM if the add-on is eligible
  // for a trial in order to show a "Try for free" CTA rather than the "Purchase" CTA.
  //
  // Without this, the worst case scenario is that the user thinks they purchased the
  // add-on, but they actually got a 14 day trial, and they end up paying for the add-on
  // after the trial ends, which is still a miscommunication.
  const showAdvancedOnly = isOnTrial || hasBasicTransforms;
  const isTrialFlow = isOnTrial && !hasBasicTransforms;

  const transformsPrice = transformsProduct?.default_base_fee ?? 0;
  const pythonPrice = pythonProduct?.default_base_fee ?? 0;

  // Determine the title based on scenario
  const getRightColumnTitle = () => {
    if (isTrialFlow) {
      return t`Add advanced transforms to your trial`;
    }
    if (hasBasicTransforms) {
      return t`Add advanced transforms to your plan`;
    }
    return t`Add transforms to your plan`;
  };

  // Determine if we should show the single-column layout:
  // - Non-store user on hosted
  // - No billing data available (can't show pricing)
  const showSingleColumn = (isHosted && !isStoreUser) || !hasData;

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

  const cardClassNames = showSingleColumn
    ? S.containerSingleColumn
    : S.container;
  const leftColumnClassNames = showSingleColumn
    ? S.leftColumnSingleColumn
    : S.leftColumn;
  const rightColumnClassNames = showSingleColumn ? undefined : S.rightColumn;

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
          <Card className={cardClassNames} p={0} withBorder>
            <Stack gap="lg" className={leftColumnClassNames} p="xl">
              <Title
                order={2}
                // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
              >{t`Start transforming your data in Metabase`}</Title>
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
                <Stack gap="lg" className={rightColumnClassNames} p="xl">
                  <Title order={3}>{getRightColumnTitle()}</Title>
                  <TierSelection
                    billingPeriod={billingPeriod}
                    pythonPrice={pythonPrice}
                    selectedTier={selectedTier}
                    setSelectedTier={setSelectedTier}
                    showAdvancedOnly={showAdvancedOnly}
                    transformsPrice={transformsPrice}
                  />
                  <PricingSummary
                    billingPeriod={billingPeriod}
                    isTrialFlow={isTrialFlow}
                    pythonPrice={pythonPrice}
                    selectedTier={selectedTier}
                    setSelectedTier={setSelectedTier}
                    showAdvancedOnly={showAdvancedOnly}
                    transformsPrice={transformsPrice}
                    trialEndDate={trialEndDate}
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
