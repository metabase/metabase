import React, { useState, useEffect } from "react";
import { t } from "ttag";

import type { Collection } from "metabase-types/api";
import { color } from "metabase/lib/colors";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { CardApi } from "metabase/services";

import { CollectionHeaderButton } from "./CollectionHeader.styled";
import { UploadInput, LoadingStateContainer } from "./CollectionUpload.styled";

const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200MB
const CLEAR_ERROR_TIMEOUT = 3000;

export default function ColllectionUpload({
  collection,
}: {
  collection: Collection;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setIsLoading(true);

    const file = event.target.files?.[0];

    if (file) {
      if (file.size > MAX_UPLOAD_SIZE) {
        alert(t`File is too large. Please upload a file smaller than 200MB.`);
        setIsLoading(false);
        setHasError(true);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("collection_id", String(collection.id));

      await CardApi.uploadCSV(formData).catch(() => setHasError(true));

      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (hasError) {
      const timeout = setTimeout(() => setHasError(false), CLEAR_ERROR_TIMEOUT);
      return () => clearTimeout(timeout);
    }
  }, [hasError]);

  if (isLoading) {
    return (
      <LoadingStateContainer>
        <LoadingSpinner size={16} />
      </LoadingStateContainer>
    );
  }

  const buttonIcon = hasError ? "close" : "arrow_up";
  const buttonColor = hasError ? color("error") : undefined;

  return (
    <>
      <label htmlFor="upload-csv">
        <CollectionHeaderButton
          as="span"
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
