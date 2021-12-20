import React from "react";
import { t, jt } from "ttag";
import { connect } from "react-redux";
import { showLicenseAcceptedToast } from "metabase-enterprise/license/actions";
import {
  LicenseStatus,
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
import { UnlicensedContent } from "metabase/admin/settings/components/SettingsLicense/content/UnlicensedContent";

const getDescription = (status?: LicenseStatus) => {
  switch (status) {
    case "unlicensed":
      return t`Bought a license to unlock advanced functionality? Please enter it below.`;
    case "active":
      return t`Your license is active! Hope you’re enjoying it.`;
    case "expired":
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
};

interface LicenseAndBillingSettingsProps {
  showLicenseAcceptedToast: () => void;
}

const LicenseAndBillingSettings = ({
  showLicenseAcceptedToast,
}: LicenseAndBillingSettingsProps) => {
  const { isLoading, error, status, updateToken } = useLicense(
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
  const isActive = status === "active";

  return (
    <SettingsLicenseContainer data-testid="license-and-billing-content">
      {!isActive && <UnlicensedContent />}

      {isActive && (
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
      )}

      <LicenseWidget
        loading={isLoading}
        description={getDescription(status)}
        error={error}
        token={MetabaseSettings.token()}
        onUpdate={isActive ? undefined : updateToken}
      />
    </SettingsLicenseContainer>
  );
};

export default connect(null, { showLicenseAcceptedToast })(
  LicenseAndBillingSettings,
);
