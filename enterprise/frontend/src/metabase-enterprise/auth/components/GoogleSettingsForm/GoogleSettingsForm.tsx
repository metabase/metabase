import React from "react";
import GoogleForm, {
  GoogleSettingsFormProps,
} from "metabase/admin/settings/components/GoogleSettingsForm";
import { hasPremiumFeature } from "metabase-enterprise/settings";

const GoogleSettingsForm = (props: GoogleSettingsFormProps): JSX.Element => {
  const hasMultipleDomains = hasPremiumFeature("sso");
  return <GoogleForm {...props} hasMultipleDomains={hasMultipleDomains} />;
};

export default GoogleSettingsForm;
