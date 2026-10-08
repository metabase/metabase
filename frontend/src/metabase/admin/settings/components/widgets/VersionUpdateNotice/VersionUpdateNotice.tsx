import { t } from "ttag";

import { getCurrentVersion } from "metabase/admin/app/selectors";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import CS from "metabase/css/core/index.css";
import { dayjs } from "metabase/dayjs";
import { useSelector } from "metabase/redux";
import { useEolDate, useGetVersionInfoQuery } from "metabase/settings";
import {
  Anchor,
  Button,
  Flex,
  HoverCard,
  Icon,
  Stack,
  Tabs,
  Text,
} from "metabase/ui";
import { getMajorVersion, newVersionAvailable } from "metabase/utils/version";

import S from "./VersionUpdateNotice.module.css";
import { getEolMessage, getVersionMessage } from "./utils";

const embedQueryParams = "?hide_nav=true&no_gdpr=true";

export function VersionUpdateNotice() {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const currentVersion = useSelector(getCurrentVersion);
  const latestVersion = versionInfo?.latest?.version;
  const eolDate = useEolDate();

  return (
    <VersionMessage
      currentVersion={currentVersion}
      latestVersion={latestVersion}
      eolDate={eolDate}
    />
  );
}

interface VersionMessageProps {
  currentVersion: string;
  latestVersion?: string;
  eolDate?: Date | null;
}

function VersionMessage({
  currentVersion,
  latestVersion,
  eolDate,
}: VersionMessageProps) {
  const isNewVersionAvailable =
    latestVersion != null &&
    newVersionAvailable({ currentVersion, latestVersion });
  const isEol = eolDate != null && new Date() > eolDate;
  const message = getVersionMessage(currentVersion, latestVersion, isEol);
  const textColor = isEol ? "text-primary" : "text-primary-inverse";
  return (
    <Flex
      align="center"
      justify="space-between"
      p="lg"
      bg={isEol ? "background_surface-warning" : "core-brand"}
      bd={isEol ? "1px solid var(--mb-color-feedback-warning)" : undefined}
      bdrs="sm"
    >
      <Flex align="center" gap="xs">
        <Text fw="bold" c={textColor}>
          {message}
        </Text>
        {isNewVersionAvailable && eolDate && (
          <EolHoverCard
            currentVersion={currentVersion}
            eolDate={eolDate}
            isEol={isEol}
          >
            <Icon name="info" c={textColor} className={CS.cursorPointer} />
          </EolHoverCard>
        )}
      </Flex>
      {isNewVersionAvailable && (
        <Button
          variant="on-dark-primary"
          component={ExternalLink}
          flex="0 0 auto"
          ml="sm"
          href="https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase"
        >
          {t`Update`}
        </Button>
      )}
      {!isNewVersionAvailable && eolDate && (
        <EolHoverCard
          currentVersion={currentVersion}
          eolDate={eolDate}
          isEol={isEol}
        >
          <Flex
            align="center"
            gap="xs"
            p="xs"
            bdrs="sm"
            className={S.hoverCardTrigger}
          >
            <Icon name="heart_handshake" c={textColor} />
            <Text c={textColor} fw="bold">
              {dayjs(eolDate).utc().format("ll")}
            </Text>
          </Flex>
        </EolHoverCard>
      )}
    </Flex>
  );
}

interface EolHoverCardProps {
  currentVersion: string;
  eolDate: Date;
  isEol: boolean;
  children: React.ReactNode;
}

function EolHoverCard({
  currentVersion,
  eolDate,
  isEol,
  children,
}: EolHoverCardProps) {
  const eolMessage = getEolMessage(currentVersion, eolDate, isEol);
  return (
    <HoverCard>
      <HoverCard.Target>{children}</HoverCard.Target>
      <HoverCard.Dropdown>
        <Stack gap="sm" p="md" w="18rem">
          <Text>{eolMessage}</Text>
          <Anchor
            component={ExternalLink}
            href="https://www.metabase.com/version-support"
            fw="bold"
          >
            {t`Learn more`}
          </Anchor>
        </Stack>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

export function NewVersionInfo() {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const latestMajorVersion =
    getMajorVersion(versionInfo?.latest?.version ?? "") ?? "";

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
