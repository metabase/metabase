import { useEffect } from "react";
import { jt, t } from "ttag";
import { connect } from "react-redux";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import AdminLayout from "metabase/components/AdminLayout";
import ExternalLink from "metabase/core/components/ExternalLink";
import { getUpgradeUrl } from "metabase/selectors/settings";
import type { SettingDefinition } from "metabase-types/api";
import type { State } from "metabase-types/store";
import { LicenseInput } from "../../components/LicenseInput";
import { initializeSettings } from "../../settings";
import { getSettings } from "../../selectors";
import type { TokenStatus } from "../../hooks/use-license";
import { useLicense } from "../../hooks/use-license";
import {
  LicenseInputTitle,
  Loader,
  PremiumEmbeddingDescription,
  PremiumEmbeddingHeading,
  PremiumEmbeddingLicensePageContent,
} from "./PremiumEmbeddingLicensePage.styled";

const getDescription = (upgradeUrl: string, tokenStatus?: TokenStatus) => {
  if (!tokenStatus?.status) {
    return t`Our Premium Embedding product has been discontinued, but if you already have a license you can activate it here. You’ll continue to receive support for the duration of your license.`;
  }

  if (!tokenStatus.isValid) {
    return (
      <>
        {jt`Your Premium Embedding license isn’t valid anymore. ${(
          <ExternalLink key="link" href={upgradeUrl}>
            {t`Explore our paid plans.`}
          </ExternalLink>
        )}`}
      </>
    );
  }

  const validUntil = moment(tokenStatus.validUntil).format("MMM D, YYYY");

  return t`Your Premium Embedding license is active until ${validUntil}.`;
};

const mapStateToProps = (state: State) => {
  return {
    settings: getSettings(state),
    upgradeUrl: getUpgradeUrl(state, { utm_media: "embed_premium" }),
  };
};

const mapDispatchToProps = {
  initializeSettings,
};

interface PremiumEmbeddingLicensePage {
  initializeSettings: () => void;
  settings: SettingDefinition[];
  upgradeUrl: string;
}

const PremiumEmbeddingLicensePage = ({
  settings,
  initializeSettings,
  upgradeUrl,
}: PremiumEmbeddingLicensePage) => {
  const tokenSetting = settings.find(
    setting => setting.key === "premium-embedding-token",
  );

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

  const placeholder = tokenSetting?.is_env_setting
    ? t`Using ${tokenSetting.env_name}`
    : undefined;

  return (
    <AdminLayout>
      <PremiumEmbeddingLicensePageContent>
        <PremiumEmbeddingHeading>{t`Premium embedding`}</PremiumEmbeddingHeading>
        <PremiumEmbeddingDescription>
          {getDescription(upgradeUrl, tokenStatus)}
        </PremiumEmbeddingDescription>
        {!tokenStatus?.isValid && (
          <LicenseInputTitle>
            {t`Enter the token you bought from the Metabase Store below.`}
          </LicenseInputTitle>
        )}
        {/* backend does not return token value */}
        <LicenseInput
          disabled={tokenSetting?.is_env_setting}
          error={error}
          loading={isUpdating}
          token={undefined}
          onUpdate={updateToken}
          invalid={isInvalid}
          placeholder={placeholder}
        />
      </PremiumEmbeddingLicensePageContent>
    </AdminLayout>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(PremiumEmbeddingLicensePage);
