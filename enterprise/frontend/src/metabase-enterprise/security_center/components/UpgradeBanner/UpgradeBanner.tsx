import { c, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Anchor, Group, Icon, Text } from "metabase/ui";

import S from "./UpgradeBanner.module.css";

const UPGRADE_DOCS_URL =
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This component only renders inside the admin-only Security Center page.
  "https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase";

interface UpgradeBannerProps {
  targetVersion: string;
}

export function UpgradeBanner({ targetVersion }: UpgradeBannerProps) {
  return (
    <Group className={S.root} gap="sm" wrap="wrap" data-testid="upgrade-banner">
      <Icon name="warning" className={S.icon} />
      <Text fw="bold" size="md" className={S.text}>
        {c("{0} is a version number like v0.59.4")
          .t`A security update is available. Update to ${targetVersion} or later to resolve known issues.`}
      </Text>
      <Anchor
        component={ExternalLink}
        href={UPGRADE_DOCS_URL}
        className={S.link}
        fw="bold"
        size="md"
      >
        {t`View upgrade instructions`}
      </Anchor>
    </Group>
  );
}
