import { t } from "ttag";

import type { CollectionId } from "metabase-types/api";

import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import NewItemButton from "../NewItemButton";
import { ProfileLink } from "../ProfileLink";
import { TableBreadcrumbs } from "../TableBreadcrumbs/TableBreadcrumbs";
import { SearchBar } from "../search/SearchBar";
import { SearchButton } from "../search/SearchButton";

import {
  AppBarInfoContainer,
  AppBarLeftContainer,
  AppBarProfileLinkContainer,
  AppBarRightContainer,
  AppBarRoot,
} from "./AppBarLarge.styled";
import { AppBarLogo } from "./AppBarLogo";
import { AppBarToggle } from "./AppBarToggle";

export interface AppBarLargeProps {
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
  onLogout: () => void;
}

const AppBarLarge = ({
  collectionId,
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
  onLogout,
}: AppBarLargeProps): JSX.Element => {
  const isNavBarVisible = isNavBarOpen && isNavBarEnabled;
  const showBreadcrumbs =
    isCollectionPathVisible ||
    isQuestionLineageVisible ||
    isTableBreadcrumbsVisible;

  return (
    <AppBarRoot isNavBarOpen={isNavBarVisible}>
      <AppBarLeftContainer>
        <AppBarToggle
          isNavBarEnabled={isNavBarEnabled}
          isNavBarOpen={isNavBarOpen}
          onToggleClick={onToggleNavbar}
        />
        <AppBarLogo
          isLogoVisible={isLogoVisible}
          isNavBarEnabled={isNavBarEnabled}
        />
        <AppBarInfoContainer isVisible={showBreadcrumbs}>
          {isCollectionPathVisible || isQuestionLineageVisible ? (
            <CollectionBreadcrumbs />
          ) : isTableBreadcrumbsVisible && question ? (
            <TableBreadcrumbs table={question.legacyQueryTable()} />
          ) : null}
        </AppBarInfoContainer>
      </AppBarLeftContainer>
      {(isSearchVisible || isNewButtonVisible || isProfileLinkVisible) && (
        <AppBarRightContainer>
          {isSearchVisible &&
            (isEmbeddingIframe ? <SearchBar /> : <SearchButton />)}
          {isNewButtonVisible && <NewItemButton collectionId={collectionId} />}
          {isProfileLinkVisible && (
            <AppBarProfileLinkContainer aria-label={t`Settings menu`}>
              <ProfileLink onLogout={onLogout} />
            </AppBarProfileLinkContainer>
          )}
        </AppBarRightContainer>
      )}
    </AppBarRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarLarge;
