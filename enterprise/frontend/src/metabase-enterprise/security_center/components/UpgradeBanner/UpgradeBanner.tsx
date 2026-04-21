import { c, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import useIsSmallScreen from "metabase/common/hooks/use-is-small-screen";
import { Anchor, Flex, Icon, Text } from "metabase/ui";

import S from "./UpgradeBanner.module.css";

const UPGRADE_DOCS_URL =
  // eslint-disable-next-line no-unconditional-metabase-links-render -- This component only renders inside the admin-only Security Center page.
  "https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase";

interface UpgradeBannerProps {
  targetVersion: string;
}

export function UpgradeBanner({ targetVersion }: UpgradeBannerProps) {
  const isSmallScreen = useIsSmallScreen();

  return (
    <Flex
      className={S.root}
      gap="sm"
      wrap="nowrap"
      data-testid="upgrade-banner"
      direction={isSmallScreen ? "column" : "row"}
    >
      <Flex gap="md" align="center">
        <Icon name="warning" className={S.icon} />
        <Text fw="bold" size="md" className={S.text}>
          {c("{0} is a version number like v0.59.4")
            .t`A security update is available. Update to ${targetVersion} or later to resolve known issues.`}
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
