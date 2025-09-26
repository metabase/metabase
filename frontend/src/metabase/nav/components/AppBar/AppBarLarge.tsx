import { t } from "ttag";

import { Nav as DetailViewNav } from "metabase/detail-view/components";
import { DETAIL_VIEW_PADDING_LEFT } from "metabase/detail-view/constants";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Box, Flex } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";
import type { DetailViewState } from "metabase-types/store";

import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import NewItemButton from "../NewItemButton";
import { ProfileLink } from "../ProfileLink";
import { SearchBar } from "../search/SearchBar";

import { AppBarInfoContainer, AppBarRoot } from "./AppBarLarge.styled";
import { AppBarLogo } from "./AppBarLogo";
import { AppBarToggle } from "./AppBarToggle";

export interface AppBarLargeProps {
  collectionId?: CollectionId;
  detailView: DetailViewState | null;
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isMetabotVisible?: boolean;
  isDocumentSidebarOpen?: boolean;
  isCommentSidebarOpen?: boolean;
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
  detailView,
  collectionId,
  isNavBarOpen,
  isNavBarEnabled,
  isMetabotVisible,
  isDocumentSidebarOpen,
  isCommentSidebarOpen,
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

  return (
    <AppBarRoot
      hasSidebarOpen={
        isNavBarVisible ||
        isMetabotVisible ||
        isDocumentSidebarOpen ||
        isCommentSidebarOpen
      }
    >
      <Flex align="center" miw="5rem" flex="1 1 auto">
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
          {detailView ? (
            <DetailViewNav
              ml={DETAIL_VIEW_PADDING_LEFT - 125}
              rowName={detailView.rowName}
              table={detailView.table}
            />
          ) : isQuestionLineageVisible ? (
            <QuestionLineage />
          ) : isCollectionPathVisible ? (
            <CollectionBreadcrumbs />
          ) : null}
        </AppBarInfoContainer>
      </Flex>
      {(isSearchVisible || isNewButtonVisible || isProfileLinkVisible) && (
        <Flex
          align="center"
          gap="sm"
          justify="flex-end"
          maw="32.5rem"
          flex="1 1 auto"
        >
          {isSearchVisible &&
            (isEmbeddingIframe ? (
              <SearchBar />
            ) : (
              <PLUGIN_METABOT.SearchButton />
            ))}
          {isNewButtonVisible && <NewItemButton collectionId={collectionId} />}
          <PLUGIN_METABOT.MetabotAppBarButton />
          {isProfileLinkVisible && (
            <Box c="var(--mb-color-text-primary)" aria-label={t`Settings menu`}>
              <ProfileLink onLogout={onLogout} />
            </Box>
          )}
        </Flex>
      )}
    </AppBarRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AppBarLarge;
