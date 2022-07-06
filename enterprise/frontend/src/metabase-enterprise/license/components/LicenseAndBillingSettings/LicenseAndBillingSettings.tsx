import React from "react";
import { t, jt } from "ttag";
import { connect } from "react-redux";
import moment from "moment";
import { showLicenseAcceptedToast } from "metabase-enterprise/license/actions";
import {
  TokenStatus,
  useLicense,
} from "metabase/admin/settings/hooks/use-license";
import {
  ExporePaidPlansContainer,
  LoaderContainer,
  SectionDescription,
  SectionHeader,
  SettingsLicenseContainer,
} from "metabase/admin/settings/components/SettingsLicense";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { LicenseInput } from "metabase/admin/settings/components/LicenseInput";
import { ExplorePlansIllustration } from "metabase/admin/settings/components/SettingsLicense/ExplorePlansIllustration";

const HOSTING_FEATURE_KEY = "hosting";
const STORE_MANAGED_FEATURE_KEY = "metabase-store-managed";
const NO_UPSELL_FEATURE_HEY = "no-upsell";

const getDescription = (tokenStatus?: TokenStatus, hasToken?: boolean) => {
  if (!hasToken) {
    return t`Bought a license to unlock advanced functionality? Please enter it below.`;
  }

  if (!tokenStatus || !tokenStatus.isValid) {
    return (
      <>
        {jt`Your license isn’t valid anymore. If you have a new license, please
        enter it below, otherwise please contact ${(
          <ExternalLink href="mailto:support@metabase.com">
            support@metabase.com
          </ExternalLink>
        )}`}
      </>
    );
  }

  const daysRemaining = moment(tokenStatus.validUntil).diff(moment(), "days");

  if (tokenStatus.isValid && tokenStatus.isTrial) {
    return t`Your trial ends in ${daysRemaining} days. If you already have a license, please enter it below.`;
  }

  const validUntil = moment(tokenStatus.validUntil).format("MMM D, YYYY");
  return t`Your license is active until ${validUntil}! Hope you’re enjoying it.`;
};

interface LicenseAndBillingSettingsProps {
  settings: Record<string, any>;
  settingValues: {
    key: string;
    value: any;
    is_env_setting: boolean;
    env_name: string;
  }[];
  showLicenseAcceptedToast: () => void;
}

const LicenseAndBillingSettings = ({
  settingValues,
  settings,
  showLicenseAcceptedToast,
}: LicenseAndBillingSettingsProps) => {
  const {
    value: token,
    is_env_setting,
    env_name,
  } = settingValues?.find(
    setting => setting.key === "premium-embedding-token",
  ) ?? {};

  const { isLoading, error, tokenStatus, updateToken, isUpdating } = useLicense(
    showLicenseAcceptedToast,
  );

  if (isLoading) {
    return (
      <SettingsLicenseContainer>
        <LoaderContainer>
          <LoadingSpinner />
        </LoaderContainer>
      </SettingsLicenseContainer>
    );
  }

  const isInvalid = !!error || (tokenStatus != null && !tokenStatus.isValid);
  const description = getDescription(tokenStatus, !!token);

  const isStoreManagedBilling = tokenStatus?.features?.includes(
    STORE_MANAGED_FEATURE_KEY,
  );
  const shouldShowLicenseInput =
    !tokenStatus?.features?.includes(HOSTING_FEATURE_KEY);

  const shouldUpsell = !tokenStatus?.features?.includes(NO_UPSELL_FEATURE_HEY);

  return (
    <SettingsLicenseContainer data-testid="license-and-billing-content">
      <>
        <SectionHeader>{t`Billing`}</SectionHeader>

        {isStoreManagedBilling && (
          <>
            <SectionDescription>
              {t`Manage your Cloud account, including billing preferences, in your Metabase Store account.`}
            </SectionDescription>

            <ExternalLink
              href={MetabaseSettings.storeUrl()}
              className="Button Button--primary"
            >
              {t`Go to the Metabase Store`}
            </ExternalLink>
          </>
        )}

        {!isStoreManagedBilling && (
          <SectionDescription>
            {jt`To manage your billing preferences, please email ${(
              <ExternalLink href="mailto:billing@metabase.com">
                billing@metabase.com
              </ExternalLink>
            )}`}
          </SectionDescription>
        )}
      </>

      {shouldShowLicenseInput && (
        <>
          <SectionHeader>{t`License`}</SectionHeader>

          <SectionDescription>{description}</SectionDescription>

          <LicenseInput
            disabled={is_env_setting}
            placeholder={is_env_setting ? t`Using ${env_name}` : undefined}
            invalid={isInvalid}
            loading={isUpdating}
            error={error}
            token={token}
            onUpdate={updateToken}
          />
        </>
      )}

      {tokenStatus?.isValid && shouldUpsell && (
        <>
          <SectionHeader>{t`Looking for more?`}</SectionHeader>
          <SectionDescription>
            {jt`You can get priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers with ${(
              <ExternalLink href={MetabaseSettings.upgradeUrl()}>
                {t`our other paid plans.`}
              </ExternalLink>
            )}`}
          </SectionDescription>
          <ExporePaidPlansContainer justifyContent="flex-end">
            <ExplorePlansIllustration />
          </ExporePaidPlansContainer>
        </>
      )}
    </SettingsLicenseContainer>
  );
};

export default connect(
  (state: any) => ({
    settingValues: state.admin.settings.settings,
    settings: state.settings.values,
  }),
  {
    showLicenseAcceptedToast,
  },
)(LicenseAndBillingSettings);
