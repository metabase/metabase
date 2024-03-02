import { t } from "ttag";

import { Icon } from "metabase/ui";
import type { Collection } from "metabase-types/api";

import { DragOverlay } from "./UploadOverlay.styled";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function UploadOverlay({
  isDragActive,
  collection,
}: {
  isDragActive: boolean;
  collection: Collection;
}) {
  return (
    <DragOverlay isDragActive={isDragActive}>
      <Icon name="upload" size="24" />
      <div>{t`Drop here to upload to ${collection.name}`}</div>
    </DragOverlay>
  );
}
