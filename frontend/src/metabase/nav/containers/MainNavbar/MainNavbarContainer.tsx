import React, { useMemo } from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import { IconProps } from "metabase/components/Icon";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { Bookmark, Collection, User } from "metabase-types/api";
import Bookmarks from "metabase/entities/bookmarks";
import Collections, {
  ROOT_COLLECTION,
  getCollectionIcon,
  buildCollectionTree,
} from "metabase/entities/collections";
import { getHasDataAccess } from "metabase/new_query/selectors";
import { getUser } from "metabase/selectors/user";
import {
  nonPersonalOrArchivedCollection,
  currentUserPersonalCollections,
} from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls";

import { SelectedItem } from "./types";
import MainNavbarView from "./MainNavbarView";
import { Sidebar, LoadingContainer, LoadingTitle } from "./MainNavbar.styled";

function mapStateToProps(state: unknown) {
  return {
    currentUser: getUser(state),
    hasDataAccess: getHasDataAccess(state),
  };
}

interface CollectionTreeItem extends Collection {
  icon: string | IconProps;
  children: CollectionTreeItem[];
}

type Props = {
  currentUser: User;
  bookmarks: Bookmark[];
  collections: Collection[];
  rootCollection: Collection;
  hasDataAccess: boolean;
  allFetched: boolean;
  location: {
    pathname: string;
  };
  params: {
    slug?: string;
  };
};

function MainNavbarContainer({
  currentUser,
  collections = [],
  rootCollection,
  hasDataAccess,
  allFetched,
  location,
  params,
  ...props
}: Props) {
  const selectedItem = useMemo<SelectedItem>(() => {
    const { pathname } = location;
    const { slug } = params;
    if (pathname.startsWith("/collection")) {
      const id = pathname.startsWith("/collection/users")
        ? "users"
        : Urls.extractCollectionId(slug);
      return { type: "collection", id };
    }
    if (pathname.startsWith("/dashboard")) {
      return { type: "dashboard", id: Urls.extractEntityId(slug) };
    }
    if (pathname.startsWith("/question") || pathname.startsWith("/model")) {
      return { type: "card", id: Urls.extractEntityId(slug) };
    }
    return { type: "unknown", url: pathname };
  }, [location, params]);

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
          selectedItem={selectedItem}
          hasDataAccess={hasDataAccess}
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
  Bookmarks.loadList({
    loadingAndErrorWrapper: false,
  }),
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
