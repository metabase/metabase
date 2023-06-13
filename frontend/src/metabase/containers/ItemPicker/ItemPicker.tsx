import { useCallback, useMemo, useState } from "react";
import * as React from "react";
import _ from "underscore";
import { connect } from "react-redux";

import { IconProps } from "metabase/core/components/Icon";

import { getCrumbs } from "metabase/lib/collections";

import Collections from "metabase/entities/collections";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import { isRootCollection } from "metabase/collections/utils";

import type { Collection, CollectionId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import type {
  CollectionPickerItem,
  PickerItem,
  PickerModel,
  PickerValue,
  SearchQuery,
} from "./types";

import ItemPickerView from "./ItemPickerView";
import { ScrollAwareLoadingAndErrorWrapper } from "./ItemPicker.styled";

interface OwnProps<TId> {
  value?: PickerValue<TId>;
  models: PickerModel[];
  entity?: typeof Collections; // collections/snippets entity
  showSearch?: boolean;
  showScroll?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onChange: (value: PickerValue<TId>) => void;
  initialOpenCollectionId?: CollectionId;
  collectionFilter?: (collection: Collection) => boolean;
}

interface StateProps {
  collectionsById: Record<CollectionId, Collection>;
  getCollectionIcon: (collection: Collection) => IconProps;
}

type Props<TId> = OwnProps<TId> & StateProps;

function canWriteToCollectionOrChildren(collection: Collection) {
  return (
    collection.can_write ||
    collection.children?.some(canWriteToCollectionOrChildren)
  );
}

function mapStateToProps<TId>(state: State, props: OwnProps<TId>) {
  const entity = props.entity || Collections;
  return {
    collectionsById: entity.selectors.getExpandedCollectionsById(state, props),
    getCollectionIcon: entity.objectSelectors.getIcon,
  };
}

function getEntityLoaderType<TId>(state: State, props: OwnProps<TId>) {
  return props.entity?.name ?? "collections";
}

function getItemId<TId>(item: PickerItem<TId> | PickerValue<TId>) {
  if (!item) {
    return;
  }
  if (item.model === "collection") {
    return item.id === null ? "root" : item.id;
  }
  return item.id;
}

function ItemPicker<TId>({
  value,
  models,
  collectionsById,
  className,
  showSearch = true,
  showScroll = true,
  style,
  onChange,
  getCollectionIcon,
  initialOpenCollectionId = "root",
}: Props<TId>) {
  const [openCollectionId, setOpenCollectionId] = useState<CollectionId>(
    initialOpenCollectionId,
  );
  const [searchString, setSearchString] = useState("");

  const isPickingNotCollection = models.some(model => model !== "collection");

  const openCollection = collectionsById[openCollectionId];

  const collections = useMemo(() => {
    let list = openCollection?.children || [];

    // show root in itself if we can pick it
    if (
      openCollection &&
      isRootCollection(openCollection) &&
      models.includes("collection")
    ) {
      list = [openCollection, ...list];
    }

    const collectionItems = list
      .filter(canWriteToCollectionOrChildren)
      .map(collection => ({
        ...collection,
        model: "collection",
      }));

    return collectionItems as CollectionPickerItem<TId>[];
  }, [openCollection, models]);

  const crumbs = useMemo(
    () =>
      getCrumbs(openCollection, collectionsById, id => setOpenCollectionId(id)),
    [openCollection, collectionsById],
  );

  const searchQuery = useMemo(() => {
    const query: SearchQuery = {};

    if (searchString) {
      query.q = searchString;
    } else {
      query.collection = openCollectionId;
    }

    if (models.length === 1) {
      query.models = models;
    }

    return query;
  }, [models, searchString, openCollectionId]);

  const checkIsItemSelected = useCallback(
    (item: PickerItem<TId>) => {
      if (!value || !item) {
        return false;
      }
      const isSameModel = item.model === value.model || models.length === 1;
      return isSameModel && getItemId(item) === getItemId(value);
    },
    [value, models],
  );

  const checkCollectionMaybeHasChildren = useCallback(
    (collection: CollectionPickerItem<TId>) => {
      if (isPickingNotCollection) {
        // Non-collection models (e.g. questions, dashboards)
        // are loaded on-demand so we don't know ahead of time
        // if they have children, so we have to assume they do
        return true;
      }

      if (isRootCollection(collection)) {
        // Skip root as we don't show root's sub-collections alongside it
        return false;
      }

      return (
        Array.isArray(collection.children) && collection.children.length > 0
      );
    },
    [isPickingNotCollection],
  );

  const checkHasWritePermissionForItem = useCallback(
    (item: PickerItem<TId>) => {
      // if user is selecting a collection, they must have a `write` access to it
      if (models.includes("collection") && item.model === "collection") {
        return item.can_write;
      }

      // if user is selecting something else (e.g. dashboard),
      // they must have `write` access to a collection item belongs to
      const collection = item.collection_id
        ? collectionsById[item.collection_id]
        : collectionsById["root"];
      return collection.can_write;
    },
    [models, collectionsById],
  );

  const handleChange = useCallback(
    (item: PickerItem<TId>) => {
      if (
        item.model === "collection" &&
        isRootCollection(item as unknown as Collection)
      ) {
        onChange({
          id: null,
          model: "collection",
        } as unknown as PickerItem<TId>);
      } else {
        onChange(item);
      }
    },
    [onChange],
  );

  const handleCollectionOpen = useCallback(collectionId => {
    setOpenCollectionId(collectionId);
  }, []);

  return (
    <ScrollAwareLoadingAndErrorWrapper
      loading={!collectionsById}
      hasScroll={showScroll}
    >
      <ItemPickerView
        className={className}
        models={models}
        collections={collections}
        searchString={searchString}
        searchQuery={searchQuery}
        showSearch={showSearch}
        crumbs={crumbs}
        onChange={handleChange}
        onSearchStringChange={setSearchString}
        onOpenCollectionChange={handleCollectionOpen}
        checkCollectionMaybeHasChildren={checkCollectionMaybeHasChildren}
        checkIsItemSelected={checkIsItemSelected}
        checkHasWritePermissionForItem={checkHasWritePermissionForItem}
        getCollectionIcon={getCollectionIcon}
        style={style}
        // personal is a fake collection for admins that contains all other user's collections
        allowFetch={openCollectionId !== "personal"}
      />
    </ScrollAwareLoadingAndErrorWrapper>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  entityObjectLoader({
    id: "root",
    entityType: getEntityLoaderType,
    loadingAndErrorWrapper: false,
  }),
  entityListLoader({
    entityType: getEntityLoaderType,
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(ItemPicker) as <TId>(props: OwnProps<TId>) => JSX.Element;
