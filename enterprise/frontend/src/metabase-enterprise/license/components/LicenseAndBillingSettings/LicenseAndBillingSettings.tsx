import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { connect } from "react-redux";
import { t, jt } from "ttag";

import { LicenseInput } from "metabase/admin/settings/components/LicenseInput";
import {
  ExplorePaidPlansContainer,
  LoaderContainer,
  SectionDescription,
  SectionHeader,
  SettingsLicenseContainer,
} from "metabase/admin/settings/components/SettingsLicense";
import { ExplorePlansIllustration } from "metabase/admin/settings/components/SettingsLicense/ExplorePlansIllustration";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import ExternalLink from "metabase/core/components/ExternalLink";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { useGetBillingInfoQuery } from "metabase-enterprise/api";
import { showLicenseAcceptedToast } from "metabase-enterprise/license/actions";
import type { TokenStatus } from "metabase-enterprise/settings/hooks/use-license";
import { useLicense } from "metabase-enterprise/settings/hooks/use-license";
import type { SettingDefinition } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { BillingInfo } from "../BillingInfo";

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
          <ExternalLink key="email" href="mailto:support@metabase.com">
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

interface StateProps {
  settingValues: SettingDefinition[];
  upgradeUrl: string;
}

interface DispatchProps {
  showLicenseAcceptedToast: () => void;
}

type LicenseAndBillingSettingsProps = DispatchProps & StateProps;

const LicenseAndBillingSettings = ({
  settingValues,
  upgradeUrl,
  showLicenseAcceptedToast,
}: LicenseAndBillingSettingsProps) => {
  const {
    value: token,
    is_env_setting,
    env_name,
  } = settingValues?.find(
    setting => setting.key === "premium-embedding-token",
  ) ?? {};

  const {
    loading: licenseLoading,
    error: licenseError,
    tokenStatus,
    updateToken,
    isUpdating,
  } = useLicense(showLicenseAcceptedToast);

  const isInvalidToken =
    !!licenseError || (tokenStatus != null && !tokenStatus.isValid);

  const isStoreManagedBilling =
    tokenStatus?.features?.has(STORE_MANAGED_FEATURE_KEY) ?? false;
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

  if (isLoading) {
    return (
      <SettingsLicenseContainer>
        <LoaderContainer>
          <LoadingSpinner />
        </LoaderContainer>
      </SettingsLicenseContainer>
    );
  }

  const hasToken = Boolean(!!token || is_env_setting);
  const description = getDescription(tokenStatus, hasToken);

  const shouldShowLicenseInput =
    !tokenStatus?.features?.has(HOSTING_FEATURE_KEY);

  const shouldUpsell = !tokenStatus?.features?.has(NO_UPSELL_FEATURE_HEY);

  return (
    <SettingsLicenseContainer data-testid="license-and-billing-content">
      <BillingInfo
        isStoreManagedBilling={isStoreManagedBilling}
        hasToken={hasToken}
        billingInfo={billingInfo}
        error={!!billingError}
      />

      {shouldShowLicenseInput && (
        <>
          <SectionHeader>{t`License`}</SectionHeader>

          <SectionDescription>{description}</SectionDescription>

          <LicenseInput
            disabled={is_env_setting}
            placeholder={is_env_setting ? t`Using ${env_name}` : undefined}
            invalid={isInvalidToken}
            loading={isUpdating}
            error={licenseError}
            token={token ? String(token) : undefined}
            onUpdate={updateToken}
          />
        </>
      )}

      {tokenStatus?.isValid && shouldUpsell && (
        <>
          <SectionHeader>{t`Looking for more?`}</SectionHeader>
          <SectionDescription>
            {jt`You can get priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers with ${(
              <ExternalLink key="plans" href={upgradeUrl}>
                {t`our other paid plans.`}
              </ExternalLink>
            )}`}
          </SectionDescription>
          <ExplorePaidPlansContainer justifyContent="flex-end">
            <ExplorePlansIllustration />
          </ExplorePaidPlansContainer>
        </>
      )}
    </SettingsLicenseContainer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  (state: State): StateProps => ({
    settingValues: state.admin.settings.settings,
    upgradeUrl: getUpgradeUrl(state, { utm_media: "license" }),
  }),
  {
    showLicenseAcceptedToast,
  },
)(LicenseAndBillingSettings);
