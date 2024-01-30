import { useEffect, useState } from "react";
import { t } from "ttag";
import type { Collection, CollectionId } from "metabase-types/api";

import { useCollectionQuery } from "metabase/common/hooks";
import { LoadingSpinner, NestedItemPicker } from "../components";
import type { PickerState, PickerItem } from "../types";

export type CollectionPickerOptions = {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
};

const defaultOptions: CollectionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
};

interface CollectionPickerProps {
  onItemSelect: (item: PickerItem) => void;
  value?: PickerItem;
  options?: CollectionPickerOptions;
}

const CollectionPickerComponent = ({
  onItemSelect,
  value,
  options = defaultOptions,
}: CollectionPickerProps) => {
  const [path, setPath] = useState<PickerState<PickerItem>>(() =>
    getStateFromIdPath({
      idPath: [null as unknown as CollectionId, "root"],
      namespace: options.namespace,
    }),
  );

  const { data: currentCollection, isLoading: loadingCurrentCollection } =
    useCollectionQuery({ id: value?.id, enabled: !!value?.id });

  const onFolderSelect = ({ folder }: { folder: PickerItem }) => {
    const newPath = getStateFromIdPath({
      idPath: getCollectionIdPath(folder),
      namespace: options.namespace,
    });
    setPath(newPath);
    onItemSelect(folder);
  };

  useEffect(
    function setInitialPath() {
      if (currentCollection?.id) {
        const newPath = getStateFromIdPath({
          idPath: getCollectionIdPath({
            id: currentCollection.id,
            location: currentCollection.location,
            is_personal: currentCollection.is_personal,
          }),
          namespace: options.namespace,
        });

        setPath(newPath);
      }
      // we need to trigger this effect on these properties because the object reference isn't stable
    },
    [
      currentCollection?.id,
      currentCollection?.location,
      currentCollection?.is_personal,
      options.namespace,
    ],
  );

  if (loadingCurrentCollection) {
    return <LoadingSpinner />;
  }

  return (
    <NestedItemPicker
      itemModel="question"
      folderModel="collection"
      options={options}
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      path={path}
    />
  );
};

export const CollectionPicker = Object.assign(
  CollectionPickerComponent,
  {
    displayName: t`Collection`,
    model: 'collection',
  },
);

const getCollectionIdPath = (
  collection: Pick<Collection, "id" | "location" | "is_personal">,
): CollectionId[] => {
  const pathFromRoot =
    collection?.location?.split("/").filter(Boolean).map(Number) ?? [];

  const path =
    collection.is_personal || collection.id === "root"
      ? [null, ...pathFromRoot, collection.id]
      : [null, "root", ...pathFromRoot, collection.id];

  return path as CollectionId[];
};

const getStateFromIdPath = ({
  idPath,
  namespace,
}: {
  idPath: CollectionId[];
  namespace?: "snippets";
}): PickerState<PickerItem> => {
  // TODO: handle collections buried in another user's personal collection 😱
  return idPath.map((id, index) => {
    const nextLevelId = idPath[index + 1] ?? null;

    if (index === 0) {
      return {
        selectedItem: {
          model: "collection",
          id: nextLevelId,
        },
      };
    }

    return {
      query: {
        collection: id,
        models: ["collection"],
        namespace,
      },
      selectedItem: nextLevelId
        ? { model: "collection", id: nextLevelId }
        : null,
    };
  });
};
