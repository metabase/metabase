import { t } from "ttag";

import { getStoreUrl } from "metabase/selectors/settings";

import { Description, Link, LinkIcon } from "./SettingsCloudStoreLink.styled";

export const SettingsCloudStoreLink = () => {
  const url = getStoreUrl();

  return (
    <div>
      {/* eslint-disable-next-line no-literal-metabase-strings -- Torch settings */}
      <Description>{t`Manage your Cloud account, including billing preferences and technical settings about this instance in your Torch Store account.`}</Description>
      <Link href={url}>
        {/* eslint-disable-next-line no-literal-metabase-strings -- Torch settings */}
        {t`Go to the Torch Store`}
        <LinkIcon name="external" />
      </Link>
    </div>
  );
};
