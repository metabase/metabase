import { useEffect, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import type { Collection, SearchResult } from "metabase-types/api";

import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { getUserIsAdmin } from "metabase/selectors/user";
import { useCollectionQuery } from "metabase/common/hooks";
import { LoadingSpinner, NestedItemPicker } from "../components";
import type { PickerState } from "../types";


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
  onItemSelect: (item: SearchResult) => void;
  value?: Partial<SearchResult>;
  options?: CollectionPickerOptions;
}

function getCollectionIdPath(collection: Collection) {
  const pathFromRoot =
    collection?.location?.split("/").filter(Boolean).map(Number) ?? [];

  const path = collection.is_personal
    ? [null, ...pathFromRoot, collection.id]
    : [null, "root", ...pathFromRoot, collection.id];

  return path;
}

export const CollectionPicker = ({
  onItemSelect,
  value,
  options = defaultOptions,
}: CollectionPickerProps) => {
  const [path, setPath] = useState<PickerState<SearchResult>>(() => {
    return [
      {
        selectedItem: { model: "collection", id: "root" },
      },
      {
        query: {
          collection: "root",
          models: ["collection"],
          namespace: options.namespace,
        },
        selectedItem: null,
      },
    ];
  });

  const isAdmin = useSelector(getUserIsAdmin);

  const { data: currentCollection, isLoading: loadingCurrentCollection } =
    useCollectionQuery({ id: value?.id, enabled: !!value?.id });

  const onFolderSelect = ({
    folder,
    level,
  }: {
    folder: Partial<SearchResult>;
    level: number;
  }) => {
    setPath(
      generatePath({
        path,
        folder,
        index: level,
        options,
        isAdmin,
      }),
    );
    onItemSelect(folder);
  };

  useEffect(() => {
    console.log("effectin", [currentCollection, value?.id, options.namespace]);
    if (value?.id && currentCollection) {
      const [firstStep, ...steps] = getCollectionIdPath(currentCollection);
      console.log(firstStep, steps);
      let _path = [...path];
      steps.forEach((p, i) => {
        _path = generatePath({
          folder: { id: p, model: "collection" },
          index: i,
          isAdmin,
          options,
          path: _path,
        });
      });

      setPath(_path);
    }
  }, [loadingCurrentCollection, value?.id, options.namespace]);

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

const generatePath = ({ path, folder, index, isAdmin, options }) => {
  const restOfPath = path.slice(0, index + 1);

  restOfPath[restOfPath.length - 1].selectedItem = {
    id: folder.id,
    model: folder.model,
  };

  if (isAdmin && folder.id === (PERSONAL_COLLECTIONS.id as unknown as number)) {
    return restOfPath.concat({
      query: {
        collection: PERSONAL_COLLECTIONS.id,
        models: ["collection"],
        namespace: options.namespace,
        'personal-only': true,
      },
      selectedItem: null,
    });
  } else {
    return restOfPath.concat({
      query: {
        collection: folder.id,
        models: ["collection"],
        namespace: options.namespace,
      },
      selectedItem: null,
    });
  }
};
