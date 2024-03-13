import type React from "react";
import { useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import { useCollectionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

import type { PickerState, CollectionPickerItem } from "../../types";
import type { EntityPickerModalOptions } from "../EntityPickerModal";
import { LoadingSpinner } from "../LoadingSpinner";
import { NestedItemPicker } from "../NestedItemPicker";

import { CollectionItemPickerResolver } from "./CollectionItemPickerResolver";
import { getStateFromIdPath, getCollectionIdPath, isFolder } from "./utils";

export type CollectionPickerOptions = EntityPickerModalOptions & {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
};

const defaultOptions: CollectionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
};

interface CollectionPickerProps {
  onItemSelect: (item: CollectionPickerItem) => void;
  initialValue?: Partial<CollectionPickerItem>;
  options?: CollectionPickerOptions;
}

export const CollectionPickerInner = (
  {
    onItemSelect,
    initialValue,
    options = defaultOptions,
  }: CollectionPickerProps,
  ref: React.Ref<unknown>,
) => {
  const [path, setPath] = useState<PickerState<CollectionPickerItem>>(() =>
    getStateFromIdPath({
      idPath: ["root"],
      namespace: options.namespace,
    }),
  );

  const {
    data: currentCollection,
    error,
    isLoading: loadingCurrentCollection,
  } = useCollectionQuery({
    id: initialValue?.id ?? "root",
    enabled: !!initialValue?.id,
  });

  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const onFolderSelect = useCallback(
    ({ folder }: { folder: CollectionPickerItem }) => {
      const newPath = getStateFromIdPath({
        idPath: getCollectionIdPath(folder, userPersonalCollectionId),
        namespace: options.namespace,
      });
      setPath(newPath);
      onItemSelect(folder);
    },
    [setPath, onItemSelect, options.namespace, userPersonalCollectionId],
  );

  // Exposing onFolderSelect so that parent can select newly created
  // folder
  useImperativeHandle(
    ref,
    () => ({
      onFolderSelect,
    }),
    [onFolderSelect],
  );

  useDeepCompareEffect(
    function setInitialPath() {
      if (currentCollection?.id) {
        const newPath = getStateFromIdPath({
          idPath: getCollectionIdPath(
            {
              id: currentCollection.id,
              location: currentCollection.location,
              is_personal: currentCollection.is_personal,
            },
            userPersonalCollectionId,
          ),
          namespace: options.namespace,
        });
        setPath(newPath);

        if (currentCollection.can_write) {
          // start with the current item selected if we can
          onItemSelect({
            ...currentCollection,
            model: "collection",
          });
        }
      }
    },
    [currentCollection, options.namespace, userPersonalCollectionId],
  );

  if (error) {
    <LoadingAndErrorWrapper error={error} />;
  }

  if (loadingCurrentCollection) {
    return <LoadingSpinner />;
  }

  return (
    <NestedItemPicker
      itemName={t`collection`}
      isFolder={isFolder}
      options={options}
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      path={path}
      listResolver={CollectionItemPickerResolver}
    />
  );
};

export const CollectionPicker = forwardRef(CollectionPickerInner);
