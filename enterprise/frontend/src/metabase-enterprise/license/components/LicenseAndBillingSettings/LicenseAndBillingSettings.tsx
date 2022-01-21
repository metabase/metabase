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
  LoaderContainer,
  SectionDescription,
  SectionHeader,
  SettingsLicenseContainer,
} from "metabase/admin/settings/components/SettingsLicense";
import ExternalLink from "metabase/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { LicenseInput } from "metabase/admin/settings/components/LicenseInput";

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
  showLicenseAcceptedToast: () => void;
}

const LicenseAndBillingSettings = ({
  showLicenseAcceptedToast,
}: LicenseAndBillingSettingsProps) => {
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

  const isStoreManagedBilling = MetabaseSettings.isStoreManaged();
  const token = MetabaseSettings.token();

  const isInvalid = !!error || (tokenStatus != null && !tokenStatus.isValid);
  const description = getDescription(tokenStatus, !!token);

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

      <SectionHeader>{t`License`}</SectionHeader>

      <SectionDescription>{description}</SectionDescription>

      <LicenseInput
        invalid={isInvalid}
        loading={isUpdating}
        error={error}
        token={token}
        onUpdate={updateToken}
      />
    </SettingsLicenseContainer>
  );
};

export default connect(null, { showLicenseAcceptedToast })(
  LicenseAndBillingSettings,
);
