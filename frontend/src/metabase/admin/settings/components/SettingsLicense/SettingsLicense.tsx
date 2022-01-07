import React from "react";
import MetabaseSettings from "metabase/lib/settings";
import { StarterContent } from "./content/StarterContent";
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

  const isStarter =
    MetabaseSettings.isHosted() && !MetabaseSettings.isEnterprise();

  if (isStarter) {
    return (
      <SettingsLicenseContainer>
        <StarterContent />
      </SettingsLicenseContainer>
    );
  }

  return <PLUGIN_LICENSE_PAGE.LicenseAndBillingSettings />;
};

export default SettingsLicense;
