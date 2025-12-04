import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import useIsSmallScreen from "metabase/common/hooks/use-is-small-screen";
import type { CollectionId, User } from "metabase-types/api";
import type { DetailViewState } from "metabase-types/store";

import { AppBarRoot } from "./AppBar.styled";
import AppBarLarge from "./AppBarLarge";
import AppBarSmall from "./AppBarSmall";

export interface AppBarProps {
  currentUser: User;
  collectionId?: CollectionId;
  detailView: DetailViewState | null;
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isMetabotVisible?: boolean;
  isCommentSidebarOpen?: boolean;
  isDocumentSidebarOpen?: boolean;
  isLogoVisible?: boolean;
  isSearchVisible?: boolean;
  isEmbeddingIframe?: boolean;
  isNewButtonVisible?: boolean;
  isProfileLinkVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
}

const AppBar = (props: AppBarProps): JSX.Element => {
  const isSmallScreen = useIsSmallScreen();

  return (
    <AppBarRoot
      data-element-id="app-bar"
      data-testid="app-bar"
      aria-label={t`Navigation bar`}
      withBorder={props.detailView != null}
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
