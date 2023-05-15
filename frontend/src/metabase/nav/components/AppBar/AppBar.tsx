import React from "react";
import { t } from "ttag";
import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
import { CollectionId, User } from "metabase-types/api";
import ErrorBoundary from "metabase/ErrorBoundary";
import AppBarSmall from "./AppBarSmall";
import AppBarLarge from "./AppBarLarge";
import { AppBarRoot } from "./AppBar.styled";

export interface AppBarProps {
  currentUser: User;
  collectionId?: CollectionId;
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
  isSearchVisible?: boolean;
  isNewButtonVisible?: boolean;
  isProfileLinkVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
  onLogout: () => void;
}

const AppBar = (props: AppBarProps): JSX.Element => {
  const isSmallScreen = useIsSmallScreen();

  return (
    <AppBarRoot data-testid="app-bar" aria-label={t`Navigation bar`}>
      <ErrorBoundary>
        {isSmallScreen ? (
          <AppBarSmall {...props} />
        ) : (
          <AppBarLarge {...props} />
        )}
      </ErrorBoundary>
    </AppBarRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBar;
