import { t } from "ttag";

import { getUserIsAdmin } from "metabase/current-user";
import type { RemoteSyncSetupMenuItemProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { FixedSizeIcon, Text, Tooltip, UnstyledButton } from "metabase/ui";

import S from "./SetupMenuItem.module.css";

const TOOLTIP_OPEN_DELAY_MS = 1000;

export function SetupMenuItem({
  isNavbarOpened,
  onClick,
}: RemoteSyncSetupMenuItemProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const isEnabled = useSetting("remote-sync-enabled");

  if (!isAdmin || isEnabled) {
    return null;
  }

  return (
    <Tooltip
      label={t`Set up remote sync`}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY_MS}
      disabled={isNavbarOpened}
    >
      <UnstyledButton
        className={S.tab}
        aria-label={t`Set up remote sync`}
        bdrs="sm"
        p="sm"
        onClick={onClick}
      >
        <FixedSizeIcon className={S.icon} name="git_branch" />
        {isNavbarOpened && <Text lh="sm">{t`Set up remote sync`}</Text>}
      </UnstyledButton>
    </Tooltip>
  );
}
