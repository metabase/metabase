import cx from "classnames";
import { c, t } from "ttag";

import { getCurrentVersion } from "metabase/admin/app/selectors";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { useGetVersionInfoQuery } from "metabase/settings";
import { Button, Tabs } from "metabase/ui";
import { newVersionAvailable, versionIsLatest } from "metabase/utils/version";

import S from "./VersionUpdateNotice.module.css";

const embedQueryParams = "?hide_nav=true&no_gdpr=true";

export function VersionUpdateNotice() {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const currentVersion = useSelector(getCurrentVersion);
  const latestVersion = versionInfo?.latest?.version;
  const displayVersion = formatVersion(currentVersion);

  if (latestVersion && versionIsLatest({ currentVersion, latestVersion })) {
    return <OnLatestVersion currentVersion={displayVersion} />;
  }

  if (latestVersion && newVersionAvailable({ currentVersion, latestVersion })) {
    return (
      <NewVersionAvailable
        currentVersion={displayVersion}
        latestVersion={latestVersion}
      />
    );
  }
  return <DefaultUpdateMessage currentVersion={displayVersion} />;
}

function OnLatestVersion({ currentVersion }: { currentVersion: string }) {
  return (
    <div>
      <div className={S.message}>
        {c(`{0} is a version number`)
          .t`You're running Metabase ${currentVersion} which is the latest and greatest!`}
      </div>
    </div>
  );
}

function DefaultUpdateMessage({ currentVersion }: { currentVersion: string }) {
  return (
    <div>
      <div className={S.message}>
        {c(`{0} is a version number`)
          .t`You're running Metabase ${currentVersion}`}
      </div>
    </div>
  );
}

function NewVersionAvailable({
  currentVersion,
  latestVersion,
}: {
  currentVersion: string;
  latestVersion: string;
}) {
  return (
    <div>
      <div
        className={cx(
          S.container,
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
          {t`Metabase ${formatVersion(latestVersion)} is available. You're running ${currentVersion}.`}
        </span>
        <Button
          className={S.updateButton}
          component={ExternalLink}
          flex="0 0 auto"
          ml="sm"
          href={
            "https://www.metabase.com/docs/" +
            latestVersion +
            "/operations-guide/upgrading-metabase.html"
          }
        >
          {t`Update`}
        </Button>
      </div>
    </div>
  );
}

export function NewVersionInfo() {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const latestMajorVersion = getLatestMajorVersion(
    versionInfo?.latest?.version,
  );

  return (
    <Tabs mt="lg" defaultValue="whats-new">
      <Tabs.List>
        <Tabs.Tab value="whats-new">{t`What's new`}</Tabs.Tab>
        <Tabs.Tab value="changelog">{t`Changelog`}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="whats-new">
        <iframe
          data-testid="releases-iframe"
          src={`https://www.metabase.com/releases${embedQueryParams}`}
          className={S.iframe}
        />
      </Tabs.Panel>
      <Tabs.Panel value="changelog">
        <iframe
          data-testid="changelog-iframe"
          src={`https://www.metabase.com/changelog/${latestMajorVersion}${embedQueryParams}`}
          className={S.iframe}
        />
      </Tabs.Panel>
    </Tabs>
  );
}

function getLatestMajorVersion(version: string | null | undefined) {
  return version?.split(".")[1] ?? "";
}

function formatVersion(versionLabel = "") {
  return versionLabel.replace(/^v/, "");
}
