import { useCallback, useState } from "react";
import type * as React from "react";
import { t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import type { IconProps } from "metabase/core/components/Icon";
import { Icon } from "metabase/core/components/Icon";

import Search from "metabase/entities/search";

import type { Collection } from "metabase-types/api";

import type {
  CollectionPickerItem,
  PickerItem,
  PickerModel,
  SearchQuery,
} from "./types";

import Item from "./Item";
import {
  ItemPickerRoot,
  ItemPickerHeader,
  ItemPickerList,
  SearchInput,
  SearchToggle,
} from "./ItemPicker.styled";

interface SearchEntityListLoaderProps<TId> {
  list: PickerItem<TId>[];
}

interface Props<TId> {
  models: PickerModel[];
  collections: CollectionPickerItem<TId>[];
  searchString: string;
  searchQuery: SearchQuery;
  showSearch?: boolean;
  allowFetch?: boolean;
  crumbs: any[];
  className?: string;
  style?: React.CSSProperties;
  onChange: (item: PickerItem<TId>) => void;
  onSearchStringChange: (searchString: string) => void;
  onOpenCollectionChange: (collectionId: PickerItem<TId>["id"]) => void;
  checkCollectionMaybeHasChildren: (
    collection: CollectionPickerItem<TId>,
  ) => boolean;
  checkIsItemSelected: (item: PickerItem<TId>) => boolean;
  checkHasWritePermissionForItem: (item: PickerItem<TId>) => boolean;
  getCollectionIcon: (collection: Collection) => IconProps;
  children: React.ReactNode;
}

function ItemPickerView<TId>({
  collections,
  models,
  searchString,
  searchQuery,
  showSearch = true,
  allowFetch = true,
  crumbs,
  className,
  style,
  onChange,
  onSearchStringChange,
  onOpenCollectionChange,
  checkCollectionMaybeHasChildren,
  checkIsItemSelected,
  checkHasWritePermissionForItem,
  getCollectionIcon,
  children,
}: Props<TId>) {
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);

  const isPickingNotCollection = models.some(model => model !== "collection");
  const canFetch = (isPickingNotCollection || searchString) && allowFetch;

  const handleSearchInputKeyPress = useCallback(
    e => {
      if (e.key === "Enter") {
        onSearchStringChange(e.target.value);
      }
    },
    [onSearchStringChange],
  );

  const handleOpenSearch = useCallback(() => {
    setIsSearchEnabled(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setIsSearchEnabled(false);
    onSearchStringChange("");
  }, [onSearchStringChange]);

  const renderHeader = useCallback(() => {
    if (isSearchEnabled) {
      return (
        <ItemPickerHeader data-testid="item-picker-header">
          <SearchInput
            type="search"
            className="input"
            placeholder={t`Search`}
            autoFocus
            onKeyPress={handleSearchInputKeyPress}
          />
          <SearchToggle onClick={handleCloseSearch}>
            <Icon name="close" />
          </SearchToggle>
        </ItemPickerHeader>
      );
    }

    return (
      <ItemPickerHeader data-testid="item-picker-header">
        <Breadcrumbs crumbs={crumbs} />
        {showSearch && (
          <SearchToggle onClick={handleOpenSearch} aria-label={t`Search`}>
            <Icon name="search" />
          </SearchToggle>
        )}
      </ItemPickerHeader>
    );
  }, [
    isSearchEnabled,
    crumbs,
    showSearch,
    handleOpenSearch,
    handleCloseSearch,
    handleSearchInputKeyPress,
  ]);

  const renderCollectionListItem = useCallback(
    (collection: CollectionPickerItem<TId>) => {
      const hasChildren = checkCollectionMaybeHasChildren(collection);

      // NOTE: this assumes the only reason you'd be selecting a collection is to modify it in some way
      const canSelect = models.includes("collection") && collection.can_write;

      const icon = getCollectionIcon(collection);

      if (canSelect || hasChildren) {
        return (
          <Item
            key={`collection-${collection.id}`}
            item={collection}
            name={collection.name}
            icon={icon}
            selected={canSelect && checkIsItemSelected(collection)}
            canSelect={canSelect}
            hasChildren={hasChildren}
            onChange={onChange}
            onChangeOpenCollectionId={onOpenCollectionChange}
          />
        );
      }

      return null;
    },
    [
      models,
      onChange,
      getCollectionIcon,
      onOpenCollectionChange,
      checkIsItemSelected,
      checkCollectionMaybeHasChildren,
    ],
  );

  const renderCollectionContentListItem = useCallback(
    (item: PickerItem<TId>) => {
      const hasPermission = checkHasWritePermissionForItem(item);

      if (
        hasPermission &&
        // only include desired models (TODO: ideally the endpoint would handle this)
        models.includes(item.model) &&
        // remove collections unless we're searching
        // (so a user can navigate through collections)
        (item.model !== "collection" || searchString)
      ) {
        return (
          <Item
            key={`${item.id}`}
            item={item}
            name={item.getName()}
            icon={item.getIcon().name}
            selected={checkIsItemSelected(item)}
            canSelect={hasPermission}
            onChange={onChange}
          />
        );
      }

      return null;
    },
    [
      models,
      searchString,
      onChange,
      checkHasWritePermissionForItem,
      checkIsItemSelected,
    ],
  );

  return (
    <ItemPickerRoot className={className} style={style}>
      {renderHeader()}
      <ItemPickerList data-testid="item-picker-list" role="list">
        {!searchString && collections.map(renderCollectionListItem)}
        {children}
        {canFetch && (
          <Search.ListLoader query={searchQuery} wrapped>
            {({ list }: SearchEntityListLoaderProps<TId>) => (
              <div>{list.map(renderCollectionContentListItem)}</div>
            )}
          </Search.ListLoader>
        )}
      </ItemPickerList>
    </ItemPickerRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ItemPickerView;
