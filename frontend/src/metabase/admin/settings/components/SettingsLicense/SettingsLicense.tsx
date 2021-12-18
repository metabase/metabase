import React from "react";
import MetabaseSettings from "metabase/lib/settings";
import { StarterContent } from "./content/StarterContent";
import { OssContent } from "./content/OssContent";
import { PLUGIN_LICENSE_PAGE } from "metabase/plugins";

const SettingsLicense = () => {
  const isOss =
    !MetabaseSettings.isHosted() && !MetabaseSettings.isEnterprise();

  if (isOss) {
    return <OssContent />;
  }

  const isStarter =
    MetabaseSettings.isHosted() && !MetabaseSettings.isEnterprise();

  if (isStarter) {
    return <StarterContent />;
  }

  return <PLUGIN_LICENSE_PAGE.LicenseAndBillingSettings />;
};

export default SettingsLicense;
