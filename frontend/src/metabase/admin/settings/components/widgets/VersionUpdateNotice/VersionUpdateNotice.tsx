import { c, t } from "ttag";

import { getCurrentVersion } from "metabase/admin/app/selectors";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSelector } from "metabase/redux";
import { useGetVersionInfoQuery } from "metabase/settings";
import { Alert, Button, Group, Icon, Tabs, Text } from "metabase/ui";
import {
  formatVersion,
  newVersionAvailable,
  versionIsLatest,
} from "metabase/utils/version";

import { SelfDowngrade } from "../SelfDowngrade";
import { SelfUpgradeButton } from "../SelfUpgrade";
import { getUpgradeGuideUrl } from "../SelfUpgrade/utils";

import S from "./VersionUpdateNotice.module.css";

const embedQueryParams = "?hide_nav=true&no_gdpr=true";

export function VersionUpdateNotice() {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const currentVersion = useSelector(getCurrentVersion);
  const latestVersion = versionInfo?.latest?.version;

  if (latestVersion && versionIsLatest({ currentVersion, latestVersion })) {
    return <OnLatestVersion currentVersion={currentVersion} />;
  }

  if (latestVersion && newVersionAvailable({ currentVersion, latestVersion })) {
    return (
      <NewVersionAvailable
        currentVersion={currentVersion}
        latestVersion={latestVersion}
      />
    );
  }
  return <DefaultUpdateMessage currentVersion={currentVersion} />;
}

function OnLatestVersion({ currentVersion }: { currentVersion: string }) {
  const displayVersion = formatVersion(currentVersion);
  return (
    <div>
      <div className={S.message}>
        {c(`{0} is a version number`)
          .t`You're running Metabase ${displayVersion} which is the latest and greatest!`}
        <SelfDowngrade currentVersion={currentVersion} />
      </div>
    </div>
  );
}

function DefaultUpdateMessage({ currentVersion }: { currentVersion: string }) {
  const displayVersion = formatVersion(currentVersion);
  return (
    <div>
      <div className={S.message}>
        {c(`{0} is a version number`)
          .t`You're running Metabase ${displayVersion}`}
        <SelfDowngrade currentVersion={currentVersion} />
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
    <Alert
      color="success"
      icon={<Icon name="sparkles" />}
      classNames={{ wrapper: S.alertWrapper }}
    >
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Text fw="bold">
            {t`Metabase ${formatVersion(latestVersion)} is available. You're running ${formatVersion(currentVersion)}.`}
          </Text>
          <SelfDowngrade currentVersion={currentVersion} />
        </div>
        <Group gap="sm" wrap="nowrap">
          <Button
            component={ExternalLink}
            flex="0 0 auto"
            size="sm"
            href={getUpgradeGuideUrl(latestVersion)}
          >
            {t`Upgrade guide`}
          </Button>
          <SelfUpgradeButton targetVersion={latestVersion} />
        </Group>
      </Group>
    </Alert>
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
