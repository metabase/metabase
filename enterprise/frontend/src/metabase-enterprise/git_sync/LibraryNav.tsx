import { t } from "ttag";

import { SettingsNavItem } from "metabase/admin/settings/components/SettingsNav";

export const LibraryNav = () => {
  return (
    <SettingsNavItem path="library" label={t`Library`} icon="folder">
      <SettingsNavItem path="library/sync" label={t`Sync`} />
      {/* Not used for now so let's hide */}
      {/* <SettingsNavItem path="library/changes" label={t`Changes`} /> */}
    </SettingsNavItem>
  );
};
