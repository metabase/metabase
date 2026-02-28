import { t } from "ttag";

import { AuthCard } from "metabase/admin/settings/auth/components/AuthCard";
import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useHasTokenFeature } from "metabase/common/hooks";
import type { EnterpriseSettings } from "metabase-types/api";

import { JWT_SCHEMA } from "../../constants";

export function JwtAuthCard() {
  const {
    value: isConfigured,
    updateSetting,
    updateSettings,
    settingDetails,
    isLoading,
  } = useAdminSetting("jwt-configured");
  const { value: isEnabled, settingDetails: jwtEnabledDetails } =
    useAdminSetting("jwt-enabled");

  const isEnabledViaEnv = !!jwtEnabledDetails?.is_env_setting;

  const handleDeactivate = () => {
    return updateSettings(
      JWT_SCHEMA.getDefault() as Partial<EnterpriseSettings>,
    );
  };

  const hasFeature = useHasTokenFeature("sso_jwt");

  if (!hasFeature) {
    return null;
  }

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <AuthCard
      type="jwt"
      name={t`JWT`}
      description={t`Allows users to login via a JWT Identity Provider.`}
      isEnabled={!!isEnabled}
      isConfigured={!!isConfigured}
      onDeactivate={isEnabledViaEnv ? undefined : handleDeactivate}
      onChange={
        isEnabledViaEnv
          ? undefined
          : (newValue) =>
              updateSetting({
                key: "jwt-enabled",
                value: newValue,
              })
      }
      setting={settingDetails}
    />
  );
}
