import { useEffect, useState } from "react";
import { t } from "ttag";

import { isRootCollection } from "metabase/collections/utils";
import { useCollectionQuery } from "metabase/common/hooks";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { CollectionId } from "metabase-types/api";

import type {
  PickerState,
  CollectionPickerItem,
  TypeWithModel,
  TisFolder,
} from "../../types";
import { LoadingSpinner } from "../LoadingSpinner";
import { NestedItemPicker } from "../NestedItemPicker";

import { CollectionItemPickerResolver } from "./CollectionItemPickerResolver";

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
  onItemSelect: (item: CollectionPickerItem) => void;
  initialValue?: Partial<CollectionPickerItem>;
  options?: CollectionPickerOptions;
}

const isFolder: TisFolder<CollectionPickerItem> = <TItem extends TypeWithModel>(
  item: TItem,
) => item.model === "collection";

export const CollectionPicker = ({
  onItemSelect,
  initialValue,
  options = defaultOptions,
}: CollectionPickerProps) => {
  const [path, setPath] = useState<PickerState<CollectionPickerItem>>(() =>
    getStateFromIdPath({
      idPath: ["root"],
      namespace: options.namespace,
    }),
  );

  const { data: currentCollection, isLoading: loadingCurrentCollection } =
    useCollectionQuery({
      id: initialValue?.id || "root",
      enabled: !!initialValue?.id,
    });

  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const onFolderSelect = ({ folder }: { folder: CollectionPickerItem }) => {
    const newPath = getStateFromIdPath({
      idPath: getCollectionIdPath(folder, userPersonalCollectionId),
      namespace: options.namespace,
    });
    setPath(newPath);
    onItemSelect(folder);
  };

  useEffect(
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
      }
      // we need to trigger this effect on these properties because the object reference isn't stable
    },
    [
      currentCollection?.id,
      currentCollection?.location,
      currentCollection?.is_personal,
      options.namespace,
      userPersonalCollectionId,
    ],
  );

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

const getCollectionIdPath = (
  collection: Pick<
    CollectionPickerItem,
    "id" | "location" | "is_personal" | "effective_location"
  >,
  userPersonalCollectionId?: CollectionId,
): CollectionId[] => {
  const location = collection?.effective_location ?? collection?.location;
  const pathFromRoot: CollectionId[] =
    location?.split("/").filter(Boolean).map(Number) ?? [];

  const isInUserPersonalCollection =
    userPersonalCollectionId &&
    (collection.id === userPersonalCollectionId ||
      pathFromRoot.includes(userPersonalCollectionId));

  if (isRootCollection(collection)) {
    return ["root"];
  }

  if (collection.id === PERSONAL_COLLECTIONS.id) {
    return ["personal"];
  }

  if (isInUserPersonalCollection) {
    return [...pathFromRoot, collection.id];
  } else if (collection.is_personal) {
    return ["personal", ...pathFromRoot, collection.id];
  } else {
    return ["root", ...pathFromRoot, collection.id];
  }
};

const getStateFromIdPath = ({
  idPath,
  namespace,
}: {
  idPath: CollectionId[];
  namespace?: "snippets";
}): PickerState<CollectionPickerItem> => {
  const statePath: PickerState<CollectionPickerItem> = [
    {
      selectedItem: {
        model: "collection",
        id: idPath[0],
      },
    },
  ];

  idPath.forEach((id, index) => {
    const nextLevelId = idPath[index + 1] ?? null;

    statePath.push({
      query: {
        collection: id,
        models: ["collection"],
        namespace,
      },
      selectedItem: nextLevelId
        ? { model: "collection", id: nextLevelId }
        : null,
    });
  });

  return statePath;
};
