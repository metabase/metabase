import { VisualState, useKBar } from "kbar";
import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LogoIcon } from "metabase/common/components/LogoIcon";
import { NewItemMenu } from "metabase/common/components/NewItemMenu";
import { userInitials } from "metabase/common/utils/user";
import { trackMetabotChatOpened } from "metabase/metabot/analytics";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";
import { useDispatch, useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { ActionIcon, Avatar, Icon, Tooltip } from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";

import S from "./NavbarRail.module.css";

type Props = {
  onOpenSidebar: () => void;
};

export function NavbarRail({ onOpenSidebar }: Props) {
  const dispatch = useDispatch();
  const user = useSelector(getUser);
  const { query } = useKBar();
  const { hasMetabotAccess } = useUserMetabotPermissions();

  const handleSearch = useCallback(() => {
    query.setVisualState(VisualState.showing);
  }, [query]);

  const handleNewChat = useCallback(() => {
    dispatch(push("/"));
    trackMetabotChatOpened("header");
  }, [dispatch]);

  return (
    <div className={S.root} data-testid="navbar-rail">
      <Tooltip label={t`Open sidebar ${METAKEY}+.`} position="right">
        <button
          type="button"
          className={S.logoToggle}
          aria-label={t`Open sidebar`}
          data-testid="navbar-expand-button"
          onClick={onOpenSidebar}
        >
          <span className={S.logoDefault}>
            <LogoIcon height={28} />
          </span>
          <span className={S.logoHover}>
            <Icon name="sidebar_open" />
          </span>
        </button>
      </Tooltip>

      <div className={S.actions}>
        <NewItemMenu
          trigger={
            <Tooltip label={t`New`} position="right">
              <ActionIcon
                variant="filled"
                color="brand"
                aria-label={t`New`}
                data-testid="navbar-new-button"
              >
                <Icon name="add" c="white" />
              </ActionIcon>
            </Tooltip>
          }
        />

        <Tooltip label={t`Search… ${METAKEY}+K`} position="right">
          <ActionIcon
            variant="subtle"
            color="text-primary"
            aria-label={t`Search`}
            data-testid="navbar-search-button"
            onClick={handleSearch}
          >
            <Icon name="search" />
          </ActionIcon>
        </Tooltip>

        {hasMetabotAccess && (
          <Tooltip label={t`New chat ${METAKEY}+E`} position="right">
            <ActionIcon
              variant="subtle"
              color="text-primary"
              aria-label={t`New chat`}
              data-testid="navbar-new-chat-button"
              onClick={handleNewChat}
            >
              <Icon name="comment" />
            </ActionIcon>
          </Tooltip>
        )}
      </div>

      <div className={S.spacer} />

      <Avatar
        color="brand"
        radius="lg"
        size={32}
        data-testid="navbar-account-button"
      >
        {user ? userInitials(user) : "?"}
      </Avatar>
    </div>
  );
}
