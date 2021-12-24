import React from "react";
import { t, jt } from "ttag";
import { connect } from "react-redux";
import moment from "moment";
import { showLicenseAcceptedToast } from "metabase-enterprise/license/actions";
import {
  TokenStatus,
  useLicense,
} from "metabase-enterprise/license/hooks/use-license";
import { LicenseWidget } from "metabase-enterprise/license/components/LicenseWidget";
import {
  LoaderContainer,
  SectionDescription,
  SectionHeader,
  SettingsLicenseContainer,
} from "metabase/admin/settings/components/SettingsLicense";
import ExternalLink from "metabase/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import LoadingSpinner from "metabase/components/LoadingSpinner";

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

  const validUntil = moment(tokenStatus.validUntil).format("MMM D, YYYY");

  if (tokenStatus.isValid && tokenStatus.isTrial) {
    return t`Your trial is active until ${validUntil}.`;
  }

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

  const isInvalid = !!error || !tokenStatus?.isValid;

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

      <LicenseWidget
        invalid={isInvalid}
        loading={isUpdating}
        description={getDescription(tokenStatus, !!token)}
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
