import React from "react";
import { t } from "ttag";

import { DragOverlay } from "./UploadOverlay.styled";

export default function UploadOverlay({
  isDragActive,
}: {
  isDragActive: boolean;
}) {
  return (
    <DragOverlay isDragActive={isDragActive}>
      {t`Drop a CSV file to upload to this collection`}
    </DragOverlay>
  );
}
