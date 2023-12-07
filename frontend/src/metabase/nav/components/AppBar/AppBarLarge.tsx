import type { CollectionId } from "metabase-types/api";
import { SearchBar } from "metabase/nav/components/search/SearchBar";
import NewItemButton from "../NewItemButton";
import { ProfileLink } from "../ProfileLink";
import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import AppBarLogo from "./AppBarLogo";
import {
  AppBarLeftContainer,
  AppBarRightContainer,
  AppBarRoot,
  AppBarInfoContainer,
  AppBarProfileLinkContainer,
} from "./AppBarLarge.styled";

export interface AppBarLargeProps {
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
  onLogout: () => void;
}

const AppBarLarge = ({
  collectionId,
  isNavBarOpen,
  isNavBarEnabled,
  isLogoVisible,
  isSearchVisible,
  isNewButtonVisible,
  isProfileLinkVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  onToggleNavbar,
  onLogout,
}: AppBarLargeProps): JSX.Element => {
  const isNavBarVisible = isNavBarOpen && isNavBarEnabled;

  return (
    <AppBarRoot isNavBarOpen={isNavBarVisible}>
      <AppBarLeftContainer
        isNavBarEnabled={isNavBarEnabled}
        isLogoVisible={isLogoVisible}
      >
        <AppBarLogo
          isLogoVisible={isLogoVisible}
          isNavBarOpen={isNavBarVisible}
          isNavBarEnabled={isNavBarEnabled}
          onToggleClick={onToggleNavbar}
        />
        <AppBarInfoContainer
          isVisible={!isNavBarVisible || isQuestionLineageVisible}
        >
          {isQuestionLineageVisible ? (
            <QuestionLineage />
          ) : isCollectionPathVisible ? (
            <CollectionBreadcrumbs />
          ) : null}
        </AppBarInfoContainer>
      </AppBarLeftContainer>
      {(isSearchVisible || isNewButtonVisible || isProfileLinkVisible) && (
        <AppBarRightContainer>
          {isSearchVisible && <SearchBar />}
          {isNewButtonVisible && <NewItemButton collectionId={collectionId} />}
          {isProfileLinkVisible && (
            <AppBarProfileLinkContainer>
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
