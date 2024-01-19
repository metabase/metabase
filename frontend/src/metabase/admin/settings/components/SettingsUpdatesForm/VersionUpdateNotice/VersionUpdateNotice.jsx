import PropTypes from "prop-types";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getIsPaidPlan } from "metabase/selectors/settings";
import HostingInfoLink from "metabase/admin/settings/components/widgets/HostingInfoLink";
import { Icon } from "metabase/ui";
import Text from "metabase/components/type/Text";

import ExternalLink from "metabase/core/components/ExternalLink";
import MetabaseSettings from "metabase/lib/settings";
import {
  HostingCTAContent,
  HostingCTAIconContainer,
  HostingCTARoot,
  NewVersionContainer,
  OnLatestVersionMessage,
} from "./VersionUpdateNotice.styled";

export default function VersionUpdateNotice() {
  const currentVersion = formatVersion(MetabaseSettings.currentVersion());

  if (MetabaseSettings.isHosted()) {
    return <CloudCustomers currentVersion={currentVersion} />;
  }

  if (MetabaseSettings.versionIsLatest()) {
    return <OnLatestVersion currentVersion={currentVersion} />;
  }

  if (MetabaseSettings.newVersionAvailable()) {
    return <NewVersionAvailable currentVersion={currentVersion} />;
  }

  return <div>{t`No successful checks yet.`}</div>;
}

function CloudCustomers({ currentVersion }) {
  return (
    <div>
      {t`Metabase Cloud keeps your instance up-to-date. You're currently on version ${currentVersion}. Thanks for being a customer!`}
    </div>
  );
}

CloudCustomers.propTypes = {
  currentVersion: PropTypes.string.isRequired,
};

function OnLatestVersion({ currentVersion }) {
  const isPaidPlan = useSelector(getIsPaidPlan);

  return (
    <div>
      <OnLatestVersionMessage>
        {t`You're running Metabase ${currentVersion} which is the latest and greatest!`}
      </OnLatestVersionMessage>
      {!isPaidPlan && <HostingCTA />}
    </div>
  );
}

OnLatestVersion.propTypes = {
  currentVersion: PropTypes.string.isRequired,
};

function NewVersionAvailable({ currentVersion }) {
  const latestVersion = MetabaseSettings.latestVersion();
  const versionInfo = MetabaseSettings.versionInfo();
  const isPaidPlan = useSelector(getIsPaidPlan);

  return (
    <div>
      <NewVersionContainer className="p2 bordered rounded border-success flex flex-row align-center justify-between">
        <span className="text-white text-bold">
          {t`Metabase ${formatVersion(latestVersion)} is available.`}{" "}
          {t`You're running ${currentVersion}`}
        </span>
        <ExternalLink
          data-metabase-event={
            "Updates Settings; Update link clicked; " + latestVersion
          }
          className="Button Button--white Button--medium borderless"
          href={
            "https://www.metabase.com/docs/" +
            latestVersion +
            "/operations-guide/upgrading-metabase.html"
          }
        >
          {t`Update`}
        </ExternalLink>
      </NewVersionContainer>

      <div
        className="text-medium bordered rounded p2 mt2 overflow-y-scroll"
        style={{ height: 330 }}
      >
        <h3 className="pb3 text-uppercase">{t`What's Changed:`}</h3>

        <Version version={versionInfo.latest} />

        {versionInfo.older &&
          versionInfo.older.map((version, index) => (
            <Version key={index} version={version} />
          ))}
      </div>

      {!isPaidPlan && <HostingCTA />}
    </div>
  );
}

NewVersionAvailable.propTypes = {
  currentVersion: PropTypes.string.isRequired,
};

function HostingCTA() {
  return (
    <HostingCTARoot className="rounded bg-light mt4 text-brand py2 px1">
      <HostingCTAContent>
        <HostingCTAIconContainer className="circular bg-medium align-center justify-center ml1 mr2">
          <Icon name="cloud" size={24} />
        </HostingCTAIconContainer>
        <div>
          <Text className="text-brand mb0">{t`Want to have upgrades taken care of for you?`}</Text>
          <Text className="text-brand text-bold">{t`Migrate to Metabase Cloud.`}</Text>
        </div>
      </HostingCTAContent>
      <div className="pr1">
        <HostingInfoLink text={t`Learn more`} />
      </div>
    </HostingCTARoot>
  );
}

function Version({ version }) {
  if (!version) {
    return null;
  }

  return (
    <div className="pb3">
      <h3 className="text-medium">
        {formatVersion(version.version)}{" "}
        {version.patch ? "(" + t`patch release` + ")" : null}
      </h3>
      <ul style={{ listStyleType: "disc", listStylePosition: "inside" }}>
        {version.highlights &&
          version.highlights.map((highlight, index) => (
            <li key={index} style={{ lineHeight: "1.5" }} className="pl1">
              {highlight}
            </li>
          ))}
      </ul>
    </div>
  );
}

Version.propTypes = {
  version: PropTypes.object.isRequired,
};

function formatVersion(versionLabel = "") {
  return versionLabel.replace(/^v/, "");
}
