import { c, t } from "ttag";

import { getEolReachedMessage } from "metabase/admin/settings/components/widgets/VersionUpdateNotice/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useEolDate } from "metabase/settings";
import { Anchor } from "metabase/ui";

import { WarningBanner } from "../WarningBanner/WarningBanner";

import S from "./UpgradeBanner.module.css";

const UPGRADE_DOCS_URL =
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This component only renders inside the admin-only Security Center page.
  "https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase";

interface UpgradeBannerProps {
  targetVersion: string | null;
}

export function UpgradeBanner({ targetVersion }: UpgradeBannerProps) {
  const { isEol } = useEolDate();

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
