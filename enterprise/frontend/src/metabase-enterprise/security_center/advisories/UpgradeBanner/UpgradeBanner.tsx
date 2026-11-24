import { c, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Anchor } from "metabase/ui";

import { WarningBanner } from "../WarningBanner/WarningBanner";
import S from "../WarningBanner/WarningBanner.module.css";

const UPGRADE_DOCS_URL =
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This component only renders inside the admin-only Security Center page.
  "https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase";

interface UpgradeBannerProps {
  targetVersion: string | null;
}

export function UpgradeBanner({ targetVersion }: UpgradeBannerProps) {
  if (!targetVersion) {
    return null;
  }

  const message = c("{0} is a version number like v0.59.4")
    .t`A security update is available. Update to ${targetVersion} or later to resolve known issues.`;

  return (
    <WarningBanner
      message={message}
      data-testid="upgrade-banner"
      rightContent={
        <Anchor
          component={ExternalLink}
          href={UPGRADE_DOCS_URL}
          className={S.link}
          fw="bold"
          size="md"
        >
          {t`View upgrade instructions`}
        </Anchor>
      }
    />
  );
}
