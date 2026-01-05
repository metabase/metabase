import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import type { GitSyncSetupMenuItemProps } from "metabase/plugins/types";
import { getUserIsAdmin } from "metabase/selectors/user";
import { FixedSizeIcon, Text, Tooltip, UnstyledButton } from "metabase/ui";

import S from "./GitSyncSetupMenuItem.module.css";

const TOOLTIP_OPEN_DELAY = 1000;

export const GitSyncSetupMenuItem = (props: GitSyncSetupMenuItemProps) => {
  const { isNavbarOpened, onClick } = props;
  const isAdmin = useSelector(getUserIsAdmin);
  const isRemoteSyncEnabled = useSetting("remote-sync-enabled");
  // Only show the "Set up Git Sync" menu item when user is admin and remote sync is not yet enabled
  const isVisible = isAdmin && !isRemoteSyncEnabled;

  if (isVisible) {
    return (
      <Tooltip
        label={t`Set up git sync`}
        position="right"
        openDelay={TOOLTIP_OPEN_DELAY}
        disabled={isNavbarOpened}
      >
        <UnstyledButton
          aria-label={t`Set up git sync`}
          bdrs="md"
          className={S.tab}
          onClick={onClick}
          p="0.5rem"
        >
          <FixedSizeIcon name="gear" className={S.icon} />
          {isNavbarOpened && <Text lh="sm">{t`Set up git sync`}</Text>}
        </UnstyledButton>
      </Tooltip>
    );
  }

  return null;
};
