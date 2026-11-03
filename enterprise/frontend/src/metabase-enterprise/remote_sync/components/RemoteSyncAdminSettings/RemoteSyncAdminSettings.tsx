import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { SettingsPageWrapper } from "metabase/settings-components";

import { RemoteSyncSettingsForm } from "./RemoteSyncSettingsForm";

export const RemoteSyncAdminSettings = () => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This link only shows for admins.
  const { url: docsUrl } = useDocsUrl(
    "data-modeling/semantic-layer/remote-sync",
    {
      anchor: "remote-sync",
    },
  );

  return (
    <SettingsPageWrapper
      title={t`Remote sync`}
      description={jt`Keep your content and transforms safely backed up in Git. Check out our ${(
        <ExternalLink key="link" href={docsUrl}>
          {t`setup guide`}
        </ExternalLink>
      )} for help.`}
    >
      <RemoteSyncSettingsForm />
    </SettingsPageWrapper>
  );
};
