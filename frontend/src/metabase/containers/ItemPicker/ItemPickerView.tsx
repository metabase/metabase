import React, { useCallback, useState } from "react";
import { t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import Icon, { IconProps } from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

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

interface SearchEntityListLoaderProps {
  list: PickerItem[];
}

interface Props {
  models: PickerModel[];
  openCollection: Collection;
  collections: CollectionPickerItem[];
  searchString: string;
  searchQuery: SearchQuery;
  showSearch?: boolean;
  crumbs: any[];
  className?: string;
  style?: React.CSSProperties;
  onChange: (item: PickerItem) => void;
  onSearchStringChange: (searchString: string) => void;
  onOpenCollectionChange: (collectionId: PickerItem["id"]) => void;
  checkCollectionMaybeHasChildren: (
    collection: CollectionPickerItem,
  ) => boolean;
  checkIsItemSelected: (item: PickerItem) => boolean;
  checkHasWritePermissionForItem: (item: PickerItem) => boolean;
  getCollectionIcon: (collection: Collection) => IconProps;
}

const getDefaultCollectionIconColor = () => color("text-light");

function ItemPickerView({
  collections,
  models,
  searchString,
  searchQuery,
  showSearch = true,
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
}: Props) {
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);

  const isPickingNotCollection = models.some(model => model !== "collection");

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
          <SearchToggle onClick={handleOpenSearch}>
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
    (collection: CollectionPickerItem) => {
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
            color={
              icon.color ? color(icon.color) : getDefaultCollectionIconColor()
            }
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
    (item: PickerItem) => {
      const hasPermission = checkHasWritePermissionForItem(item);

      if (
        hasPermission &&
        // only include desired models (TODO: ideally the endpoint would handle this)
        models.includes(item.model) &&
        // remove collections unless we're searching
        // (so a user can navigate through collections)
        (item.model !== "collection" || !!searchString)
      ) {
        return (
          <Item
            key={item.id}
            item={item}
            name={item.getName()}
            color={item.getColor()}
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
      <ItemPickerList data-testid="item-picker-list">
        {!searchString && collections.map(renderCollectionListItem)}
        {(isPickingNotCollection || searchString) && (
          <Search.ListLoader query={searchQuery} wrapped>
            {({ list }: SearchEntityListLoaderProps) => (
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
