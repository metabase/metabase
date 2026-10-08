import { c, t } from "ttag";

import { getEolReachedMessage } from "metabase/admin/settings/components/widgets/VersionUpdateNotice/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { useEolDate } from "metabase/settings";
import { Anchor, Flex, Icon, Text } from "metabase/ui";

import S from "./UpgradeBanner.module.css";

const UPGRADE_DOCS_URL =
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This component only renders inside the admin-only Security Center page.
  "https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase";

interface UpgradeBannerProps {
  targetVersion: string | null;
}

export function UpgradeBanner({ targetVersion }: UpgradeBannerProps) {
  const isSmallScreen = useIsSmallScreen();
  const eolDate = useEolDate();
  const isEol = eolDate != null && new Date() > eolDate;

  const message = targetVersion
    ? c("{0} is a version number like v0.59.4")
        .t`A security update is available. Update to ${targetVersion} or later to resolve known issues.`
    : isEol
      ? getEolReachedMessage()
      : null;

  if (!message) {
    return null;
  }

  return (
    <Flex
      className={S.root}
      gap="lg"
      wrap="nowrap"
      data-testid="upgrade-banner"
      direction={isSmallScreen ? "column" : "row"}
    >
      <Flex gap="lg" align="center">
        <Icon name="warning" className={S.icon} />
        <Text fw="bold" size="md" className={S.text}>
          {message}
        </Text>
      </Flex>
      <Anchor
        component={ExternalLink}
        href={UPGRADE_DOCS_URL}
        className={S.link}
        fw="bold"
        size="md"
      >
        {t`View upgrade instructions`}
      </Anchor>
    </Flex>
  );
}
