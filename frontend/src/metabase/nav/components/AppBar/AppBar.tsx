import type { ReactNode } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import type { DetailViewState } from "metabase/redux/store";
import type { CollectionId, SearchResult, User } from "metabase-types/api";

import S from "./AppBar.module.css";
import { AppBarLarge } from "./AppBarLarge";
import { AppBarSmall } from "./AppBarSmall";

export interface AppBarProps {
  currentUser: User | null;
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
  isAppSwitcherVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  isMetricsViewer?: boolean;
  collectionBreadcrumbs?: ReactNode;
  questionLineage?: ReactNode;
  onSearchItemSelect?: (result: SearchResult) => void;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
}

export const AppBar = (props: AppBarProps): JSX.Element => {
  const isSmallScreen = useIsSmallScreen();

  return (
    <header
      className={S.AppBarRoot}
      data-element-id="app-bar"
      data-testid="app-bar"
      data-with-border={props.detailView != null}
      aria-label={t`Navigation bar`}
    >
      <ErrorBoundary>
        {isSmallScreen ? (
          <AppBarSmall {...props} />
        ) : (
          <AppBarLarge {...props} />
        )}
      </ErrorBoundary>
    </header>
  );
};
