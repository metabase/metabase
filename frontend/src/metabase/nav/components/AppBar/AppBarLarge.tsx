import cx from "classnames";
import { t } from "ttag";

import { CommentFeed } from "metabase/comments";
import CS from "metabase/css/core/index.css";
import { Box, Icon, Popover } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import NewItemButton from "../NewItemButton";
import { ProfileLink } from "../ProfileLink";
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
  isEmbedded?: boolean;
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
  isEmbedded,
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
          {isSearchVisible && (isEmbedded ? <SearchBar /> : <SearchButton />)}
          {isNewButtonVisible && <NewItemButton collectionId={collectionId} />}
          <Popover width="20rem" position="bottom-end">
            <Popover.Target>
              <Icon
                name="comment"
                onClick={onToggleNavbar}
                className={cx(CS.cursorPointer, CS.textBrandHover)}
              />
            </Popover.Target>
            <Popover.Dropdown>
              <Box w="20rem" p="lg" mah="20rem">
                <CommentFeed />
                <div style={{ height: "1.5rem" }} />
              </Box>
            </Popover.Dropdown>
          </Popover>
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
