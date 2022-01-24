import React from "react";
import MetabaseSettings from "metabase/lib/settings";
import { UnlicensedContent } from "./content/UnlicensedContent";
import { PLUGIN_LICENSE_PAGE } from "metabase/plugins";
import { SettingsLicenseContainer } from "./SettingsLicense.styled";

const SettingsLicense = () => {
  const isOss =
    !MetabaseSettings.isHosted() && !MetabaseSettings.isEnterprise();

  if (isOss) {
    return (
      <SettingsLicenseContainer>
        <UnlicensedContent />
      </SettingsLicenseContainer>
    );
  }

  return <PLUGIN_LICENSE_PAGE.LicenseAndBillingSettings />;
};

export default SettingsLicense;
