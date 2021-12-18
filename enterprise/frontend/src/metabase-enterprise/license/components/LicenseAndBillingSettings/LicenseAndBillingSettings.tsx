import React, { useEffect } from "react";
import { t, jt } from "ttag";
import { connect } from "react-redux";
import { useLicenseStatus } from "metabase-enterprise/license/hooks/use-license-status";
import { showLicenseAcceptedToast } from "metabase-enterprise/license/actions";
import {
  LoaderContainer,
  SectionDescription,
  SectionHeader,
  SettingsLicenseContainer,
} from "metabase/admin/settings/components/SettingsLicense";
import { LicenseWidget } from "metabase/admin/settings/components/SettingsLicense/LicenseWidget";
import ExternalLink from "metabase/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { LICENSE_ACCEPTED_URL_HASH } from "metabase/admin/settings/constants";
import { useTokenUpdate } from "metabase/admin/settings/components/SettingsLicense/use-token-update";

const getDescription = (isValid?: boolean) => {
  if (isValid) {
    return t`Your license is active! Hope you’re enjoying it.`;
  }

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
};

interface LicenseAndBillingSettingsProps {
  showLicenseAcceptedToast: () => void;
}

const LicenseAndBillingSettings = ({
  showLicenseAcceptedToast,
}: LicenseAndBillingSettingsProps) => {
  useEffect(() => {
    if (window.location.hash === LICENSE_ACCEPTED_URL_HASH) {
      window.location.hash = "";
      showLicenseAcceptedToast();
    }
  }, [showLicenseAcceptedToast]);

  const { isLoading, isValid } = useLicenseStatus();
  const { isLoading: isUpdatingToken, updateToken, error } = useTokenUpdate();

  if (isLoading) {
    <SettingsLicenseContainer>
      <LoaderContainer>
        <LoadingSpinner />
      </LoaderContainer>
    </SettingsLicenseContainer>;
  }

  const isStoreManagedBilling = MetabaseSettings.isStoreManaged();

  return (
    <SettingsLicenseContainer>
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

      <LicenseWidget
        loading={isUpdatingToken}
        description={getDescription(isValid)}
        error={error}
        token={isValid ? MetabaseSettings.license() : ""}
        onUpdate={isValid ? undefined : updateToken}
      />
    </SettingsLicenseContainer>
  );
};

export default connect(null, { showLicenseAcceptedToast })(
  LicenseAndBillingSettings,
);
