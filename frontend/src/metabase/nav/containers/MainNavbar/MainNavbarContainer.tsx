import React, { useMemo } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import LoadingSpinner from "metabase/components/LoadingSpinner";

import { Bookmark, Collection, User } from "metabase-types/api";
import Collections, {
  ROOT_COLLECTION,
  getCollectionIcon,
} from "metabase/entities/collections";
import { getUser } from "metabase/selectors/user";
import {
  buildCollectionTree,
  nonPersonalOrArchivedCollection,
  currentUserPersonalCollections,
  CollectionTreeItem,
} from "metabase/collections/utils";

import MainNavbarView from "./MainNavbarView";
import { Sidebar, LoadingContainer, LoadingTitle } from "./MainNavbar.styled";

function mapStateToProps(state: unknown) {
  return {
    currentUser: getUser(state),
  };
}

type Props = {
  currentUser: User;
  bookmarks: Bookmark[];
  collections: Collection[];
  rootCollection: Collection;
  allFetched: boolean;
  location: {
    pathname: string;
  };
};

function MainNavbarContainer({
  currentUser,
  collections = [],
  rootCollection,
  allFetched,
  location,
  ...props
}: Props) {
  const collectionTree = useMemo<CollectionTreeItem[]>(() => {
    if (!rootCollection) {
      return [];
    }

    const preparedCollections = [];
    const userPersonalCollections = currentUserPersonalCollections(
      collections,
      currentUser.id,
    );
    const nonPersonalOrArchivedCollections = collections.filter(
      nonPersonalOrArchivedCollection,
    );

    preparedCollections.push(...userPersonalCollections);
    preparedCollections.push(...nonPersonalOrArchivedCollections);

    const root: CollectionTreeItem = {
      ...rootCollection,
      icon: getCollectionIcon(rootCollection),
      children: [],
    };

    return [root, ...buildCollectionTree(preparedCollections)];
  }, [rootCollection, collections, currentUser]);

  return (
    <Sidebar>
      {allFetched && rootCollection ? (
        <MainNavbarView
          {...props}
          currentUser={currentUser}
          collections={collectionTree}
          currentPathname={location.pathname}
        />
      ) : (
        <LoadingContainer>
          <LoadingSpinner />
          <LoadingTitle>{t`Loading…`}</LoadingTitle>
        </LoadingContainer>
      )}
    </Sidebar>
  );
}

export default _.compose(
  Collections.load({
    id: ROOT_COLLECTION.id,
    entityAlias: "rootCollection",
    loadingAndErrorWrapper: false,
  }),
  Collections.loadList({
    query: () => ({ tree: true }),
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(MainNavbarContainer);
