import cx from "classnames";
import { c, t } from "ttag";

import {
  getCurrentVersion,
  getLatestVersion,
} from "metabase/admin/settings/selectors";
import { useSetting } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { newVersionAvailable, versionIsLatest } from "metabase/lib/utils";
import { getIsHosted } from "metabase/setup/selectors";
import type { VersionInfoRecord } from "metabase-types/api";

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
  const versionInfo = useSetting("version-info");
  const updateChannel = useSetting("update-channel");
  const latestVersion = useSelector(getLatestVersion);

  const lastestVersionInfo = versionInfo?.[updateChannel];

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

      {versionInfo && (
        <div
          className={cx(
            CS.textMedium,
            CS.bordered,
            CS.rounded,
            CS.p2,
            CS.mt2,
            CS.overflowYScroll,
          )}
          style={{ height: 330 }}
        >
          <h3 className={cx(CS.pb3, CS.textUppercase)}>{t`What's Changed:`}</h3>

          {lastestVersionInfo && <Version version={lastestVersionInfo} />}

          {versionInfo.older &&
            versionInfo.older.map((version, index) => (
              <Version key={index} version={version} />
            ))}
        </div>
      )}
    </div>
  );
}

function Version({ version }: { version: VersionInfoRecord }) {
  if (!version) {
    return null;
  }

  return (
    <div className={CS.pb3}>
      <h3 className={CS.textMedium}>{formatVersion(version.version)}</h3>
      <ul style={{ listStyleType: "disc", listStylePosition: "inside" }}>
        {version.highlights &&
          version.highlights.map((highlight, index) => (
            <li key={index} style={{ lineHeight: "1.5" }} className={CS.pl1}>
              {highlight}
            </li>
          ))}
      </ul>
    </div>
  );
}

function formatVersion(versionLabel = "") {
  return versionLabel.replace(/^v/, "");
}
