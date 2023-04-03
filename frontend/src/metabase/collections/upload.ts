import { CardApi } from "metabase/services";
import type { CollectionId } from "metabase-types/api";

// const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200MB
// const MAX_UPLOAD_STRING = "200MB";

export function uploadCSV({
  file,
  collectionId,
}: {
  file: File;
  collectionId?: CollectionId;
}) {
  // if (!file) {
  //   onError?.(t`You must select a file to upload.`);
  //   return;
  // }

  // if (!collectionId) {
  //   onError?.(t`You must select a collection to upload to.`);
  //   return;
  // }

  // if (file.size > MAX_UPLOAD_SIZE) {
  //   onError?.(t`You cannot upload files larger than ${MAX_UPLOAD_STRING}`);
  //   return;
  // }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("collection_id", String(collectionId));

  return CardApi.uploadCSV(formData);
}
