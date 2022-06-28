import React from "react";
import { CollectionId } from "metabase-types/api";
import AppBarLogo from "./AppBarLogo";
import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import {
  AppBarRoot,
  AppBarLeftContainer,
  InfoBarContainer,
} from "./AppBarDesktop.styled";

export interface AppBarDesktopProps {
  collectionId?: CollectionId;
  isNavBarOpen?: boolean;
  isNavBarVisible?: boolean;
  isSearchVisible?: boolean;
  isNewButtonVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavBar: () => void;
  onCloseNavBar: () => void;
}

const AppBarDesktop = ({
  collectionId,
  isNavBarOpen,
  isNavBarVisible,
  isSearchVisible,
  isNewButtonVisible,
  isCollectionPathVisible,
  isQuestionLineageVisible,
  onToggleNavBar,
  onCloseNavBar,
}: AppBarDesktopProps): JSX.Element => {
  return (
    <AppBarRoot>
      <AppBarLeftContainer>
        <AppBarLogo
          isNavBarOpen={isNavBarOpen}
          isNavBarVisible={isNavBarVisible}
          onToggleNavBar={onToggleNavBar}
        />
        <InfoBarContainer isNavBarOpen={isNavBarOpen}>
          {isQuestionLineageVisible ? (
            <QuestionLineage />
          ) : isCollectionPathVisible ? (
            <CollectionBreadcrumbs collectionId={collectionId} />
          ) : null}
        </InfoBarContainer>
      </AppBarLeftContainer>
    </AppBarRoot>
  );
};
