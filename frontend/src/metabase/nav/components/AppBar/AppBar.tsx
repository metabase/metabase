import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
import { useSelector } from "metabase/lib/redux";
import { getLocaleWritingDirection } from "metabase/selectors/app";
import type { CollectionId, User } from "metabase-types/api";

import { AppBarRoot } from "./AppBar.styled";
import AppBarLarge from "./AppBarLarge";
import AppBarSmall from "./AppBarSmall";

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
  const writingDirection = useSelector(getLocaleWritingDirection);

  return (
    <AppBarRoot
      data-testid="app-bar"
      aria-label={t`Navigation bar`}
      dir={writingDirection}
    >
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
