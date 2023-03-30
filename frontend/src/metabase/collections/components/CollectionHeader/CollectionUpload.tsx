import React, { useState, useEffect } from "react";

import type { Collection } from "metabase-types/api";
import { color } from "metabase/lib/colors";
import LoadingSpinner from "metabase/components/LoadingSpinner";

// import { uploadCSV } from "metabase/collections/upload";

// import { uploadCSV } from "metabase/redux/uploads";

import { CollectionHeaderButton } from "./CollectionHeader.styled";
import { UploadInput, LoadingStateContainer } from "./CollectionUpload.styled";

const CLEAR_ERROR_TIMEOUT = 3000;

export default function ColllectionUpload({
  collection,
  onUploadCSV,
}: {
  collection: Collection;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsLoading(true);

    console.log("derp");
    onUploadCSV(event.target.files?.[0], collection.id);

    setIsLoading(false);
  };

  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(""), CLEAR_ERROR_TIMEOUT);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  if (isLoading) {
    return (
      <LoadingStateContainer>
        <LoadingSpinner size={16} />
      </LoadingStateContainer>
    );
  }

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
