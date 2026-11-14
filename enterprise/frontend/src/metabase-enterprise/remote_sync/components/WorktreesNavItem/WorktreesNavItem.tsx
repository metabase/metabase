import { t } from "ttag";

import { AreaTab } from "metabase/nav/components/AreaLayout";
import type { RemoteSyncWorktreesNavItemProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import * as Urls from "metabase/urls";

import { getIsRemoteSyncVisible } from "../../selectors";

export function WorktreesNavItem({
  isNavbarOpened,
  isSelected,
}: RemoteSyncWorktreesNavItemProps) {
  const isVisible = useSelector(getIsRemoteSyncVisible);

  if (!isVisible) {
    return null;
  }

  return (
    <AreaTab
      label={t`Worktrees`}
      icon="git_branch"
      to={Urls.dataStudioWorktrees()}
      isSelected={isSelected}
      showLabel={isNavbarOpened}
    />
  );
}
