import { useDropzone } from "react-dropzone";

import { skipToken, useListCollectionItemsQuery } from "metabase/api";
import UploadOverlay from "metabase/collections/components/UploadOverlay";
import { useDispatch } from "metabase/lib/redux";
import { uploadFile } from "metabase/redux/uploads";
import { Box } from "metabase/ui";
import { UploadMode } from "metabase-types/store/upload";

import { ItemList } from "../../EntityPicker";
import type { CollectionItemListProps, CollectionPickerItem } from "../types";

const dropMessage = [
  "Hey Sloan",
  "Head you wanted to be able to do this",
  "I got you buddy 💝",
];

export const CollectionItemList = ({
  query,
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
  shouldShowItem,
  level = 0,
}: CollectionItemListProps) => {
  const {
    data: collectionItems,
    error,
    isLoading,
  } = useListCollectionItemsQuery<{
    data: {
      data: CollectionPickerItem[];
    };
    error: any;
    isLoading: boolean;
  }>(query ? query : skipToken);

  const collectionId = query.id;

  const dispatch = useDispatch();

  const onDrop = ([file]) => {
    dispatch(uploadFile({ file, collectionId, uploadMode: UploadMode.create }));
  };

  const { isDragActive, getRootProps } = useDropzone({
    onDrop,
    maxFiles: 1,
    noClick: true,
    noDragEventsBubbling: true,
    accept: { "text/csv": [".csv"], "text/tab-separated-values": [".tsv"] },
  });

  return (
    <Box pos="relative" h="100%" {...getRootProps()}>
      <ItemList
        items={collectionItems?.data}
        isLoading={isLoading}
        error={error}
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        shouldDisableItem={shouldDisableItem}
        shouldShowItem={shouldShowItem}
      />
      <UploadOverlay
        message={dropMessage[level - 1] || "drop here"}
        isDragActive={isDragActive}
      />
    </Box>
  );
};
