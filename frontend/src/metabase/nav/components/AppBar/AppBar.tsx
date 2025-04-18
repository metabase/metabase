import ErrorBoundary from "metabase/ErrorBoundary";
import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
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
  isEmbeddingIframe?: boolean;
  isNewButtonVisible?: boolean;
  isProfileLinkVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  isTableBreadcrumbsVisible?: boolean;
  question?: any;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
  onLogout: () => void;
}

const AppBar = ({
  isNavBarOpen,
  isNavBarEnabled,
  isLogoVisible,
  isSearchVisible,
  isEmbeddingIframe,
  isNewButtonVisible,
  isProfileLinkVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  isTableBreadcrumbsVisible,
  question,
  onToggleNavbar,
  onCloseNavbar,
  onLogout,
}: AppBarProps): JSX.Element => {
  const isSmallScreen = useIsSmallScreen();

  return (
    <ErrorBoundary>
      <AppBarRoot>
        {isSmallScreen ? (
          <AppBarSmall
            isNavBarOpen={isNavBarOpen}
            isNavBarEnabled={isNavBarEnabled}
            isLogoVisible={isLogoVisible}
            isSearchVisible={isSearchVisible}
            isEmbeddingIframe={isEmbeddingIframe}
            isProfileLinkVisible={isProfileLinkVisible}
            isCollectionPathVisible={isCollectionPathVisible}
            isQuestionLineageVisible={isQuestionLineageVisible}
            onToggleNavbar={onToggleNavbar}
            onCloseNavbar={onCloseNavbar}
            onLogout={onLogout}
          />
        ) : (
          <AppBarLarge
            isNavBarOpen={isNavBarOpen}
            isNavBarEnabled={isNavBarEnabled}
            isLogoVisible={isLogoVisible}
            isSearchVisible={isSearchVisible}
            isEmbeddingIframe={isEmbeddingIframe}
            isNewButtonVisible={isNewButtonVisible}
            isProfileLinkVisible={isProfileLinkVisible}
            isCollectionPathVisible={isCollectionPathVisible}
            isQuestionLineageVisible={isQuestionLineageVisible}
            isTableBreadcrumbsVisible={isTableBreadcrumbsVisible}
            question={question}
            onToggleNavbar={onToggleNavbar}
            onCloseNavbar={onCloseNavbar}
            onLogout={onLogout}
          />
        )}
      </AppBarRoot>
    </ErrorBoundary>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBar;
