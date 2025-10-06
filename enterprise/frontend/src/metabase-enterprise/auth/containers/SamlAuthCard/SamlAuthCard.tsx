import { t } from "ttag";

import { AuthCard } from "metabase/admin/settings/auth/components/AuthCard";
import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import type { EnterpriseSettings } from "metabase-types/api";

import { SAML_SCHEMA } from "../../constants";

export function SamlAuthCard() {
  const {
    value: isConfigured,
    updateSetting,
    updateSettings,
    settingDetails,
    isLoading,
  } = useAdminSetting("saml-configured");
  const { value: isEnabled } = useAdminSetting("saml-enabled");

  const handleDeactivate = () => {
    return updateSettings(
      SAML_SCHEMA.getDefault() as Partial<EnterpriseSettings>,
    );
  };

  const hasFeature = useHasTokenFeature("sso_saml");

  if (!hasFeature) {
    return null;
  }

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <AuthCard
      type="saml"
      name={t`SAML`}
      description={t`Allows users to login via a SAML Identity Provider.`}
      isConfigured={!!isConfigured}
      isEnabled={!!isEnabled}
      onDeactivate={handleDeactivate}
      onChange={(newValue) =>
        updateSetting({
          key: "saml-enabled",
          value: newValue,
        })
      }
      setting={settingDetails as any}
    />
  );
}
