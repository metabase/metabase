import React, { useState, useEffect } from "react";

import type { Collection, CollectionId } from "metabase-types/api";
import { color } from "metabase/lib/colors";

import { CollectionHeaderButton } from "./CollectionHeader.styled";
import { UploadInput } from "./CollectionUpload.styled";

const CLEAR_ERROR_TIMEOUT = 3000;

export default function ColllectionUpload({
  collection,
  onUpload,
}: {
  collection: Collection;
  onUpload: (file: File, collectionId: CollectionId) => void;
}) {
  const [error, setError] = useState("");

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) {
      onUpload(file, collection.id);
    }
  };

  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(""), CLEAR_ERROR_TIMEOUT);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  const buttonIcon = error ? "close" : "arrow_up";
  const buttonColor = error ? color("error") : undefined;

  return (
    <>
      <label htmlFor="upload-csv">
        <CollectionHeaderButton
          as="span"
          to=""
          icon={buttonIcon}
          color={buttonColor}
        />
      </label>
      <UploadInput
        id="upload-csv"
        type="file"
        accept="text/csv"
        onChange={handleFileUpload}
      />
    </>
  );
}
