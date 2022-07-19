import React, { useEffect } from "react";
import { jt, t } from "ttag";
import { connect } from "react-redux";
import moment from "moment";
import AdminLayout from "metabase/components/AdminLayout";
import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import {
  LicenseInputTitle,
  Loader,
  PremiumEmbeddingDescription,
  PremiumEmbeddingHeading,
  PremiumEmbeddingLicensePageContent,
} from "./PremiumEmbeddingLicensePage.styled";
import { LicenseInput } from "../../components/LicenseInput";
import { initializeSettings } from "../../settings";
import { getSettings } from "../../selectors";
import { TokenStatus, useLicense } from "../../hooks/use-license";

const getDescription = (tokenStatus?: TokenStatus, hasToken?: boolean) => {
  if (!hasToken) {
    return t`Our Premium Embedding product has been discontinued, but if you already have a license you can activate it here. You’ll continue to receive support for the duration of your license.`;
  }

  if (!tokenStatus || !tokenStatus.isValid) {
    return (
      <>
        {jt`Your Premium Embedding license isn’t valid anymore. ${(
          <ExternalLink href={MetabaseSettings.upgradeUrl()}>
            {t`Explore our paid plans.`}
          </ExternalLink>
        )}`}
      </>
    );
  }

  const validUntil = moment(tokenStatus.validUntil).format("MMM D, YYYY");

  return t`Your Premium Embedding license is active until ${validUntil}.`;
};

const mapStateToProps = (state: any) => {
  return {
    settings: getSettings(state),
  };
};

const mapDispatchToProps = {
  initializeSettings,
};

interface PremiumEmbeddingLicensePage {
  initializeSettings: () => void;
  settings: any[];
}

export const PremiumEmbeddingLicensePage = ({
  settings,
  initializeSettings,
}: PremiumEmbeddingLicensePage) => {
  const tokenSetting = settings.find(
    setting => setting.key === "premium-embedding-token",
  );
  const token = tokenSetting?.value;

  const { isLoading, error, tokenStatus, updateToken, isUpdating } =
    useLicense();

  useEffect(() => {
    initializeSettings();
  }, [initializeSettings]);

  const hasSettings = settings.length > 0;

  if (isLoading || !hasSettings) {
    return (
      <AdminLayout>
        <PremiumEmbeddingLicensePageContent>
          <Loader />
        </PremiumEmbeddingLicensePageContent>
      </AdminLayout>
    );
  }

  const isInvalid = !!error || (tokenStatus != null && !tokenStatus.isValid);

  const placeholder = tokenSetting.is_env_setting
    ? t`Using ${tokenSetting.env_name}`
    : undefined;

  return (
    <AdminLayout>
      <PremiumEmbeddingLicensePageContent>
        <PremiumEmbeddingHeading>{t`Premium embedding`}</PremiumEmbeddingHeading>
        <PremiumEmbeddingDescription>
          {getDescription(tokenStatus, !!token)}
        </PremiumEmbeddingDescription>
        {!tokenStatus?.isValid && (
          <LicenseInputTitle>
            {t`Enter the token you bought from the Metabase Store below.`}
          </LicenseInputTitle>
        )}
        <LicenseInput
          disabled={tokenSetting.is_env_setting}
          error={error}
          loading={isUpdating}
          token={token}
          onUpdate={updateToken}
          invalid={isInvalid}
          placeholder={placeholder}
        />
      </PremiumEmbeddingLicensePageContent>
    </AdminLayout>
  );
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(PremiumEmbeddingLicensePage);
