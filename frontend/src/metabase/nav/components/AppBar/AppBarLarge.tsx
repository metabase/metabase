import type { CollectionId } from "metabase-types/api";

import { t } from "ttag";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import CollectionBreadcrumbs from "../../containers/CollectionBreadcrumbs";
import QuestionLineage from "../../containers/QuestionLineage";
import NewItemButton from "../NewItemButton";
import { ProfileLink } from "../ProfileLink";
import { SearchBar } from "../search/SearchBar";
import { SearchButton } from "../search/SearchButton";
import { useListDatabasesQuery } from "metabase/api";
import {
  AppBarLeftContainer,
  AppBarRightContainer,
  AppBarRoot,
  AppBarInfoContainer,
  AppBarProfileLinkContainer,
} from "./AppBarLarge.styled";
import { AppBarLogo } from "./AppBarLogo";
import { AppBarToggle } from "./AppBarToggle";
import { SemanticCrumbs } from "metabase/components/SemanticCrumbs";
import { useMemo } from "react";
import { SettingsCrumbs } from "metabase/browse/components/CompanySettings/SettingsCrumbs";

export interface AppBarLargeProps {
  collectionId?: CollectionId;
  cubeName?: string;
  semanticName?: string;
  semanticSlug?: string;
  isNavBarOpen?: boolean;
  isNavBarEnabled?: boolean;
  isLogoVisible?: boolean;
  isSearchVisible?: boolean;
  isEmbedded?: boolean;
  isNewButtonVisible?: boolean;
  isProfileLinkVisible?: boolean;
  isCollectionPathVisible?: boolean;
  isSemanticLayerVisible?: boolean;
  isDataMapVisible?: boolean;
  isQuestionLineageVisible?: boolean;
  onToggleNavbar: () => void;
  onLogout: () => void;
}

const AppBarLarge = ({
  collectionId,
  cubeName,
  semanticName,
  semanticSlug,
  isNavBarOpen,
  isNavBarEnabled,
  isLogoVisible,
  isSearchVisible,
  isEmbedded,
  isNewButtonVisible,
  isProfileLinkVisible,
  isCollectionPathVisible,
  isSemanticLayerVisible,
  isDataMapVisible,
  isQuestionLineageVisible,
  onToggleNavbar,
  onLogout,
}: AppBarLargeProps): JSX.Element => {
  const isNavBarVisible = isNavBarOpen && isNavBarEnabled;

  const path = window.location.pathname;
  const databaseIdFromPath: any = path.match(
    /\/settings\/databases\/([^/]+)/,
  )?.[1]; // Extracts the ID after "databases/" in settings
  const databaseIdForBrowse = path.match(/\/browse\/databases\/([^/]+)/)?.[1]; // Extracts the ID after "browse/databases/"
  const schemaFromPath = path.match(
    /\/browse\/databases\/[^/]+\/schema\/([^/]+)/,
  )?.[1]; // Extracts the schema after "schema/"

  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = data?.data;

  // Find the database name that matches the ID from the path
  const databaseNameForBreadcrumb = databaseIdForBrowse
    ? databases?.find((db: any) => db.id.toString() === databaseIdForBrowse)
        ?.name
    : null;

  const breadcrumbItems = useMemo(() => {
    const breadcrumbs: { title: string; to: string }[] = [];

    // Settings paths
    if (path.startsWith("/settings")) {
      breadcrumbs.push({ title: t`Company settings`, to: "/settings" });
      if (path.startsWith("/settings/databases")) {
        breadcrumbs.push({ title: t`Databases`, to: "/settings/databases" });
        if (databaseIdFromPath) {
          breadcrumbs.push({
            title: t`Edit Database`,
            to: `/settings/databases/${databaseIdFromPath}`,
          });
        }
      } else if (path === "/settings/people") {
        breadcrumbs.push({ title: t`People`, to: "/settings/people" });
      } else if (path.startsWith("/settings/permissions")) {
        breadcrumbs.push({
          title: t`Permissions`,
          to: "/settings/permissions",
        });
      }
    }

    // Browse paths
    if (path.startsWith("/browse/databases") && databaseIdForBrowse) {
      breadcrumbs.push({ title: t`Raw data`, to: "/browse/databases" });
      if (databaseNameForBreadcrumb) {
        breadcrumbs.push({
          title: t`${databaseNameForBreadcrumb}`,
          to: `/browse/databases/${databaseIdForBrowse}/schemas`,
        });
        if (schemaFromPath) {
          breadcrumbs.push({
            title: t`${schemaFromPath}`,
            to: `/browse/databases/${databaseIdForBrowse}/schema/${schemaFromPath}`,
          });
        }
      }
    }

    return breadcrumbs;
  }, [
    path,
    databaseIdFromPath,
    databaseIdForBrowse,
    schemaFromPath,
    databaseNameForBreadcrumb,
  ]);

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
          isVisible={
            !isNavBarVisible ||
            isQuestionLineageVisible ||
            isSemanticLayerVisible ||
            isDataMapVisible ||
            path.startsWith("/settings") ||
            path.startsWith("/browse/databases")
          }
        >
          {isQuestionLineageVisible ? (
            <QuestionLineage />
          ) : isCollectionPathVisible ? (
            <CollectionBreadcrumbs />
          ) : isSemanticLayerVisible && !isDataMapVisible ? (
            <SemanticCrumbs
              crumbs={[
                ...(semanticName
                  ? [
                      {
                        title: t`${semanticName}`,
                        to: `/browse/semantic-layer/${semanticSlug}`,
                      },
                    ]
                  : []),
                ...(cubeName ? [{ title: cubeName }] : []),
              ]}
            />
          ) : isDataMapVisible ? (
            <SemanticCrumbs
              crumbs={[
                {
                  title: t`${semanticName}`,
                  to: `/browse/semantic-layer/${semanticSlug}`,
                },
                { title: `Data Map` },
              ]}
            />
          ) : path.startsWith("/settings") ||
            (path.startsWith("/browse/databases") && databaseIdForBrowse) ? (
            <SettingsCrumbs crumbs={breadcrumbItems} />
          ) : null}
        </AppBarInfoContainer>
      </AppBarLeftContainer>
      {(isSearchVisible || isNewButtonVisible || isProfileLinkVisible) && (
        <AppBarRightContainer>
          {isSearchVisible && (isEmbedded ? <SearchBar /> : <SearchButton />)}
          {/* {isNewButtonVisible && <NewItemButton collectionId={collectionId} />} */}
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
