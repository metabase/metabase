import React from "react";

import type { Collection, CollectionId } from "metabase-types/api";

import { CollectionHeaderButton } from "./CollectionHeader.styled";
import { UploadInput } from "./CollectionUpload.styled";

export default function ColllectionUpload({
  collection,
  onUpload,
}: {
  collection: Collection;
  onUpload: (file: File, collectionId: CollectionId) => void;
}) {
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) {
      onUpload(file, collection.id);
    }
  };

  return (
    <>
      <label htmlFor="upload-csv">
        <CollectionHeaderButton as="span" to="" icon="arrow_up" />
      </label>
      <UploadInput
        id="upload-csv"
        type="file"
        accept="text/csv"
        onChange={handleFileUpload}
        data-testid="upload-input"
      />
    </>
  );
}
