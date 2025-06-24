import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { EnterpriseSettings } from "metabase-types/api";

import { AuthCard } from "../../components/AuthCard";
import { GOOGLE_SCHEMA } from "../../constants";

export function GoogleAuthCard() {
  const {
    value: isConfigured,
    updateSetting,
    updateSettings,
    settingDetails,
    isLoading,
  } = useAdminSetting("google-auth-configured");
  const { value: isEnabled } = useAdminSetting("google-auth-enabled");

  const handleDeactivate = () => {
    return updateSettings(
      GOOGLE_SCHEMA.getDefault() as Partial<EnterpriseSettings>,
    );
  };

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <AuthCard
      type="google"
      name={t`Sign in with Google`}
      description={t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`}
      isConfigured={!!isConfigured}
      isEnabled={!!isEnabled}
      onDeactivate={handleDeactivate}
      onChange={(newValue) =>
        updateSetting({
          key: "google-auth-enabled",
          value: newValue,
        })
      }
      setting={settingDetails}
    />
  );
}
