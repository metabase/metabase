import { VisualState, useKBar } from "kbar";
import type { MouseEvent } from "react";
import { useCallback } from "react";
import { t } from "ttag";

import DataStudioLogo from "assets/img/data-studio-logo.svg";
import { Link } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { NewItemMenu } from "metabase/common/components/NewItemMenu";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import { METAKEY } from "metabase/utils/browser";

import { InstanceMenuTrigger } from "./InstanceMenuTrigger";
import S from "./NavbarTopRow.module.css";
import { trackAppNewButtonClicked } from "./analytics";

type Props = {
  onItemSelect: () => void;
  isDataStudio?: boolean;
};

export function NavbarTopRow({ onItemSelect, isDataStudio = false }: Props) {
  const isAtHomepageDashboard = useIsAtHomepageDashboard();
  const { query } = useKBar();

  const handleLogoClick = useCallback(
    (event: MouseEvent) => {
      // Prevent navigating to the dashboard homepage when a user is already there
      // https://github.com/metabase/metabase/issues/43800
      if (isAtHomepageDashboard) {
        event.preventDefault();
      }
      onItemSelect();
    },
    [isAtHomepageDashboard, onItemSelect],
  );

  const handleSearchClick = useCallback(() => {
    query.setVisualState(VisualState.showing);
  }, [query]);

  const handleNewClick = useCallback(() => {
    trackAppNewButtonClicked();
  }, []);

  return (
    <div className={S.root} data-testid="navbar-top-row">
      <div className={S.left}>
        <Link
          to="/"
          onClick={handleLogoClick}
          className={S.logoLink}
          aria-label={t`Home`}
          data-testid="main-logo-link"
        >
          <span className={S.logoBox}>
            {isDataStudio ? (
              <img
                className={S.logoImage}
                src={DataStudioLogo}
                alt={t`Data Studio`}
                height={28}
              />
            ) : (
              <LogoIcon height={28} />
            )}
          </span>
        </Link>
        <AppSwitcher
          menuPosition="bottom-start"
          trigger={<InstanceMenuTrigger />}
        />
      </div>
      <div className={S.right}>
        <Tooltip label={t`Search… ${METAKEY}+K`}>
          <ActionIcon
            variant="subtle"
            color="text-primary"
            aria-label={t`Search`}
            data-testid="navbar-search-button"
            onClick={handleSearchClick}
          >
            <Icon name="search" />
          </ActionIcon>
        </Tooltip>
        <NewItemMenu
          trigger={
            <Tooltip label={t`New`}>
              <ActionIcon
                variant="filled"
                color="brand"
                aria-label={t`New`}
                data-testid="navbar-new-button"
                onClick={handleNewClick}
              >
                <Icon name="add" c="white" />
              </ActionIcon>
            </Tooltip>
          }
        />
      </div>
    </div>
  );
}
