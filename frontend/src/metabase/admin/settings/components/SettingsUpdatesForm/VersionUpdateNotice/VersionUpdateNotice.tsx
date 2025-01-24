import cx from "classnames";
import { c, t } from "ttag";

import {
  getCurrentVersion,
  getLatestVersion,
} from "metabase/admin/settings/selectors";
import ExternalLink from "metabase/core/components/ExternalLink";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { newVersionAvailable, versionIsLatest } from "metabase/lib/utils";
import { getIsHosted } from "metabase/setup/selectors";

import {
  NewVersionContainer,
  OnLatestVersionMessage,
} from "./VersionUpdateNotice.styled";

export function VersionUpdateNotice() {
  const currentVersion = useSelector(getCurrentVersion);
  const latestVersion = useSelector(getLatestVersion);
  const isHosted = useSelector(getIsHosted);

  if (isHosted) {
    return <CloudCustomers currentVersion={currentVersion} />;
  }

  const displayVersion = formatVersion(currentVersion);

  if (versionIsLatest({ currentVersion, latestVersion })) {
    return <OnLatestVersion currentVersion={displayVersion} />;
  }

  if (newVersionAvailable({ currentVersion, latestVersion })) {
    return <NewVersionAvailable currentVersion={displayVersion} />;
  }
  return <DefaultUpdateMessage currentVersion={displayVersion} />;
}

function CloudCustomers({ currentVersion }: { currentVersion: string }) {
  return (
    <div>
      {t`Metabase Cloud keeps your instance up-to-date. You're currently on version ${currentVersion}. Thanks for being a customer!`}
    </div>
  );
}

function OnLatestVersion({ currentVersion }: { currentVersion: string }) {
  return (
    <div>
      <OnLatestVersionMessage>
        {c(`{0} is a version number`)
          .t`You're running Metabase ${currentVersion} which is the latest and greatest!`}
      </OnLatestVersionMessage>
    </div>
  );
}

function DefaultUpdateMessage({ currentVersion }: { currentVersion: string }) {
  return (
    <div>
      <OnLatestVersionMessage>
        {c(`{0} is a version number`)
          .t`You're running Metabase ${currentVersion}`}
      </OnLatestVersionMessage>
    </div>
  );
}

function NewVersionAvailable({ currentVersion }: { currentVersion: string }) {
  const latestVersion = useSelector(getLatestVersion);

  return (
    <div>
      <NewVersionContainer
        className={cx(
          CS.p2,
          CS.bordered,
          CS.rounded,
          CS.borderSuccess,
          CS.flex,
          CS.flexRow,
          CS.alignCenter,
          CS.justifyBetween,
        )}
      >
        <span className={cx(CS.textWhite, CS.textBold)}>
          {t`Metabase ${formatVersion(latestVersion)} is available.`}{" "}
          {t`You're running ${currentVersion}`}
        </span>
        <ExternalLink
          className={cx(
            ButtonsS.Button,
            ButtonsS.ButtonWhite,
            ButtonsS.ButtonMedium,
            CS.borderless,
          )}
          href={
            "https://www.metabase.com/docs/" +
            latestVersion +
            "/operations-guide/upgrading-metabase.html"
          }
        >
          {t`Update`}
        </ExternalLink>
      </NewVersionContainer>

      <iframe
        width="100%"
        height="400px"
        src="https://metabase.com/releases"
        style={{ border: "none", marginTop: "1rem" }}
      ></iframe>
    </div>
  );
}

function formatVersion(versionLabel = "") {
  return versionLabel.replace(/^v/, "");
}
