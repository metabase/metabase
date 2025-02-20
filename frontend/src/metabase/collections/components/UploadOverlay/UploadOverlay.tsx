import { t } from "ttag";

import { Icon } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { DragOverlay } from "./UploadOverlay.styled";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function UploadOverlay({
  isDragActive,
  collection,
  message,
}: {
  isDragActive: boolean;
  collection?: Collection;
  message?: string;
}) {
  return (
    <DragOverlay isDragActive={isDragActive}>
      <Icon name="upload" size="24" />
      <div>{message || t`Drop here to upload to ${collection.name}`}</div>
    </DragOverlay>
  );
}
