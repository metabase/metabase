import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_GIT_SYNC, PLUGIN_METABOT } from "metabase/plugins";
import { Group } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import NewItemButton from "../NewItemButton";
import { ProfileLink } from "../ProfileLink";
import { SearchBar } from "../search/SearchBar";

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
  isMetabotVisible?: boolean;
  isLogoVisible?: boolean;
  isSearchVisible?: boolean;
  isEmbeddingIframe?: boolean;
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
  isMetabotVisible,
  isLogoVisible,
  isSearchVisible,
  isEmbeddingIframe,
  isNewButtonVisible,
  isProfileLinkVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  onToggleNavbar,
  onLogout,
}: AppBarLargeProps): JSX.Element => {
  const isNavBarVisible = isNavBarOpen && isNavBarEnabled;
  const gitSyncConfigured = useSelector((_state) => true);
  return (
    <AppBarRoot hasSidebarOpen={isNavBarVisible || isMetabotVisible}>
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
          <Group gap="sm" display="flex" align="center" wrap="nowrap">
            {gitSyncConfigured && <PLUGIN_GIT_SYNC.SelectBranch />}
            {gitSyncConfigured && <PLUGIN_GIT_SYNC.ViewChangesButton />}
          </Group>
          {isSearchVisible &&
            (isEmbeddingIframe ? (
              <SearchBar />
            ) : (
              <PLUGIN_METABOT.SearchButton />
            ))}
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
