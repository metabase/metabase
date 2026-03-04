import dayjs from "dayjs";
import { useCallback } from "react";
import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { LicenseInput } from "metabase/admin/settings/components/LicenseInput";
import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { ExplorePlansIllustration } from "metabase/admin/settings/components/SettingsLicense/ExplorePlansIllustration";
import { useGetAdminSettingsDetailsQuery } from "metabase/api";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting, useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { Box, Divider, Flex, Stack } from "metabase/ui";
import { useGetBillingInfoQuery } from "metabase-enterprise/api";
import { useLicense } from "metabase-enterprise/settings/hooks/use-license";
import type { TokenStatus } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { BillingInfo } from "../BillingInfo";

const HOSTING_FEATURE_KEY = "hosting";
const STORE_MANAGED_FEATURE_KEY = "metabase-store-managed";
const NO_UPSELL_FEATURE_HEY = "no-upsell";

const getDescription = ({
  tokenStatus,
  hasToken,
  airgapEnabled,
}: {
  tokenStatus?: TokenStatus;
  hasToken: boolean;
  airgapEnabled: boolean;
}) => {
  if (!hasToken) {
    return t`Bought a license to unlock advanced functionality? Please enter it below.`;
  }

  if (!tokenStatus || !tokenStatus.valid) {
    return (
      <>
        {jt`Your license isn’t valid anymore. If you have a new license, please
        enter it below, otherwise please contact ${
          (
            // eslint-disable-next-line i18next/no-literal-string
            <ExternalLink key="email" href="mailto:support@metabase.com">
              support@metabase.com
            </ExternalLink>
          )
        }`}
      </>
    );
  }

  const daysRemaining = dayjs(tokenStatus["valid-thru"]).diff(dayjs(), "days");

  if (tokenStatus.valid && airgapEnabled) {
    return t`Your token expires in ${daysRemaining} days.`;
  }

  if (tokenStatus.valid && tokenStatus.trial) {
    return t`Your trial ends in ${daysRemaining} days. If you already have a license, please enter it below.`;
  }

  const validUntil = dayjs(tokenStatus["valid-thru"]).format("MMM D, YYYY");
  return t`Your license is active until ${validUntil}! Hope you’re enjoying it.`;
};

export const LicenseAndBillingSettings = () => {
  const { data: allSettings, isLoading: isLoadingToken } =
    useGetAdminSettingsDetailsQuery();
  const settingDetails = allSettings?.["premium-embedding-token"];
  const token = settingDetails?.value;

  const [sendToast] = useToast();

  const sendActivatedToast = useCallback(() => {
    sendToast({ message: t`Your license is active!` });
  }, [sendToast]);

  const {
    loading: licenseLoading,
    error: licenseError,
    tokenStatus,
    updateToken,
    isUpdating,
  } = useLicense(sendActivatedToast);

  const airgapEnabled = useSetting("airgap-enabled");

  const isInvalidToken =
    !!licenseError || (tokenStatus != null && !tokenStatus.valid);

  const isStoreManagedBilling =
    tokenStatus?.features?.includes(STORE_MANAGED_FEATURE_KEY) ?? false;
  const shouldFetchBillingInfo =
    !licenseLoading && !isInvalidToken && isStoreManagedBilling;

  const {
    isLoading: billingLoading,
    error: billingError,
    data: billingInfo,
  } = useGetBillingInfoQuery(undefined, {
    skip: !shouldFetchBillingInfo,
  });

  const isLoading = licenseLoading || billingLoading;

  if (isLoading || isLoadingToken) {
    return <LoadingAndErrorWrapper loading />;
  }

  const hasToken = Boolean(!!token || settingDetails?.is_env_setting);
  const description = getDescription({ tokenStatus, hasToken, airgapEnabled });

  const shouldShowLicenseInput =
    !tokenStatus?.features?.includes(HOSTING_FEATURE_KEY);

  const shouldUpsell = !tokenStatus?.features?.includes(NO_UPSELL_FEATURE_HEY);

  return (
    <SettingsPageWrapper title={t`License`}>
      <SettingsSection>
        <Stack
          data-testid="license-and-billing-content"
          maw="36rem"
          px="lg"
          gap="lg"
        >
          <Box>
            <BillingInfo
              isStoreManagedBilling={isStoreManagedBilling}
              hasToken={hasToken}
              billingInfo={billingInfo}
              error={!!billingError}
            />
          </Box>

          {shouldShowLicenseInput && (
            <Box>
              <SettingHeader
                id="license"
                title={t`License`}
                description={description}
              />
              <LicenseInput
                disabled={settingDetails?.is_env_setting}
                placeholder={
                  settingDetails?.is_env_setting
                    ? t`Using ${settingDetails?.env_name}`
                    : undefined
                }
                loading={isUpdating}
                error={licenseError}
                token={token ? String(token) : undefined}
                onUpdate={updateToken}
              />
            </Box>
          )}

          {tokenStatus?.valid && shouldUpsell && <UpsellSection />}
        </Stack>
      </SettingsSection>
    </SettingsPageWrapper>
  );
};

function UpsellSection() {
  const upgradeUrl = useSelector((state: State) =>
    getUpgradeUrl(state, { utm_content: "license" }),
  );

  return (
    <Box mt="xl">
      <SettingHeader
        id="upsell"
        title={t`Looking for more?`}
        description={jt`You can get priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers with ${(
          <ExternalLink key="plans" href={upgradeUrl}>
            {t`our other paid plans.`}
          </ExternalLink>
        )}`}
      />
      <Flex mt="md" justify="flex-end">
        <ExplorePlansIllustration />
      </Flex>
      <Divider />
    </Box>
  );
}
