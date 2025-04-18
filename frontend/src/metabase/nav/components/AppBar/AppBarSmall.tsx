import { SearchBar } from "metabase/nav/components/search/SearchBar";

import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import { ProfileLink } from "../ProfileLink";
import { SearchButton } from "../search/SearchButton";

import { AppBarLogo } from "./AppBarLogo";
import {
  AppBarHeader,
  AppBarLogoContainer,
  AppBarMainContainer,
  AppBarProfileLinkContainer,
  AppBarRoot,
  AppBarSearchContainer,
  AppBarSubheader,
  AppBarToggleContainer,
} from "./AppBarSmall.styled";
import { AppBarToggle } from "./AppBarToggle";

export interface AppBarSmallProps {
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
  isSearchVisible?: boolean;
  isEmbeddingIframe?: boolean;
  isProfileLinkVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
  onCloseNavbar: () => void;
  onLogout: () => void;
}

const AppBarSmall = ({
  isNavBarOpen,
  isNavBarEnabled,
  isLogoVisible,
  isSearchVisible,
  isEmbeddingIframe,
  isProfileLinkVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  onToggleNavbar,
  onLogout,
}: AppBarSmallProps): JSX.Element => {
  return (
    <AppBarRoot>
      <AppBarHeader>
        <AppBarMainContainer>
          <AppBarToggleContainer>
            <AppBarToggle
              isNavBarEnabled={isNavBarEnabled}
              isNavBarOpen={isNavBarOpen}
              onToggleClick={onToggleNavbar}
            />
          </AppBarToggleContainer>
          <AppBarLogoContainer>
            <AppBarLogo
              isLogoVisible={isLogoVisible}
              isNavBarEnabled={isNavBarEnabled}
            />
          </AppBarLogoContainer>
          {(isSearchVisible || isProfileLinkVisible) && (
            <AppBarSearchContainer>
              {isSearchVisible &&
                (isEmbeddingIframe ? <SearchBar /> : <SearchButton />)}
              {isProfileLinkVisible && (
                <AppBarProfileLinkContainer>
                  <ProfileLink onLogout={onLogout} />
                </AppBarProfileLinkContainer>
              )}
            </AppBarSearchContainer>
          )}
        </AppBarMainContainer>
      </AppBarHeader>
      {(isCollectionPathVisible || isQuestionLineageVisible) && (
        <AppBarSubheader>
          <CollectionBreadcrumbs />
        </AppBarSubheader>
      )}
    </AppBarRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarSmall;
