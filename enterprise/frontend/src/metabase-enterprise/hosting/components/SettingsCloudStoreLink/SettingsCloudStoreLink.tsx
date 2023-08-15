import { t } from "ttag";
import { getStoreUrl } from "metabase/selectors/settings";
import { Description, Link, LinkIcon } from "./SettingsCloudStoreLink.styled";

export const SettingsCloudStoreLink = () => {
  const url = getStoreUrl();

  return (
    <div>
      <Description>{t`Manage your Cloud account, including billing preferences and technical settings about this instance in your Metabase Store account.`}</Description>
      <Link href={url}>
        {t`Go to the Metabase Store`}
        <LinkIcon name="external" />
      </Link>
    </div>
  );
};
