import type React from "react";
import { useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import { useCollectionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";

import type { PickerState, QuestionPickerItem } from "../../types";
import type { EntityPickerModalOptions } from "../EntityPickerModal";
import { LoadingSpinner } from "../LoadingSpinner";
import { NestedItemPicker } from "../NestedItemPicker";

import { QuestionItemPickerResolver } from "./QuestionItemPickerResolver";
import { getStateFromIdPath, getCollectionIdPath, isFolder } from "./utils";

export type QuestionPickerOptions = EntityPickerModalOptions & {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
};

const defaultOptions: QuestionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
};

interface QuestionPickerProps {
  onItemSelect: (item: QuestionPickerItem) => void;
  initialValue?: Partial<QuestionPickerItem>;
  options?: QuestionPickerOptions;
}

export const QuestionPickerInner = (
  {
    onItemSelect,
    initialValue,
    options = defaultOptions,
  }: QuestionPickerProps,
  ref: React.Ref<unknown>,
) => {
  const [path, setPath] = useState<PickerState<QuestionPickerItem>>(() =>
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
    ({ folder }: { folder: QuestionPickerItem }) => {
      const newPath = getStateFromIdPath({
        idPath: getCollectionIdPath(folder, userPersonalCollectionId),
        namespace: options.namespace,
      });
      setPath(newPath);
      onItemSelect(folder);
    },
    [setPath, onItemSelect, options.namespace, userPersonalCollectionId],
  );

  const handleItemSelect = (item: QuestionPickerItem) => {
    // set selected item at the correct level
    const pathLevel = path.findIndex(
      level => level?.query?.collection === (item?.collection_id ?? 'root')
    );

    const newPath = path.slice(0, pathLevel + 1);
    newPath[newPath.length - 1].selectedItem = item;
    setPath(newPath);
    onItemSelect(item);
  }

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
      itemName={t`question`}
      isFolder={isFolder}
      options={options}
      onFolderSelect={onFolderSelect}
      onItemSelect={handleItemSelect}
      path={path}
      listResolver={QuestionItemPickerResolver}
    />
  );
};

export const QuestionPicker = forwardRef(QuestionPickerInner);
