import type { Ref } from "react";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { t } from "ttag";

import {
  NestedItemPicker,
  type EntityPickerModalOptions,
  type PickerState,
} from "../../EntityPicker";
import type {
  DatabaseItem,
  NotebookDataPickerItem,
  NotebookDataPickerQuery,
} from "../types";
import { isFolder } from "../utilts";

import { NotebookDataItemPickerResolver } from "./NotebookDataItemPickerResolver";
// import { getCollectionIdPath, isFolder } from "./utils";

export type TablePickerOptions = EntityPickerModalOptions & {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
};

const defaultOptions: TablePickerOptions = {
  showPersonalCollections: false,
  showRootCollection: false,
};

interface Props {
  onItemSelect: (item: NotebookDataPickerItem) => void;
  initialValue?: Partial<NotebookDataPickerItem>;
  options?: TablePickerOptions;
}

const getStateFromIdPath = (
  idPath: DatabaseItem['id'],
): PickerState<NotebookDataPickerItem, NotebookDataPickerQuery> => {

    const statePath: PickerState<CollectionPickerItem, SearchListQuery> = [
      {
        selectedItem: {
          name: "",
          model: "collection",
          id: idPath[0],
        },
      },
    ];

  return statePath;
};

export const TablePicker = forwardRef(function TablePicker(
  { onItemSelect, initialValue, options = defaultOptions }: Props,
  ref: Ref<unknown>,
) {
  const [path, setPath] = useState<
    PickerState<NotebookDataPickerItem, NotebookDataPickerQuery>
  >(
    getStateFromIdPath({
      idPath: ["root"],
      namespace: options.namespace,
    }),
  );

  const onFolderSelect = useCallback(
    ({ folder }: { folder: NotebookDataPickerItem }) => {
      // const newPath = getStateFromIdPath(folder);
      // setPath(newPath);
      // onItemSelect(folder);
    },
    [setPath, onItemSelect],
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

  // useDeepCompareEffect(
  //   function setInitialPath() {
  //     if (currentCollection?.id) {
  //       const newPath = getStateFromIdPath({
  //         idPath: getCollectionIdPath(
  //           {
  //             id: currentCollection.id,
  //             location: currentCollection.location,
  //             is_personal: currentCollection.is_personal,
  //           },
  //           userPersonalCollectionId,
  //         ),
  //         namespace: options.namespace,
  //       });
  //       setPath(newPath);

  //       if (currentCollection.can_write) {
  //         // start with the current item selected if we can
  //         onItemSelect({
  //           ...currentCollection,
  //           model: "collection",
  //         });
  //       }
  //     }
  //   },
  //   [currentCollection, options.namespace, userPersonalCollectionId],
  // );

  // if (error) {
  //   <LoadingAndErrorWrapper error={error} />;
  // }

  // if (isLoading) {
  //   return <LoadingSpinner />;
  // }

  return (
    <NestedItemPicker
      isFolder={isFolder}
      itemName={t`table`}
      listResolver={NotebookDataItemPickerResolver}
      options={options}
      path={path}
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      generateKey={JSON.stringify} // TODO ?
    />
  );
});
