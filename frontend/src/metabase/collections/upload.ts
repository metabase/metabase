import { t } from "ttag";
import { CardApi } from "metabase/services";
import type { CollectionId } from "metabase-types/api";

const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_UPLOAD_STRING = "200MB";

export async function uploadCSV({
  file,
  collectionId,
  onError,
}: {
  file?: File;
  collectionId?: CollectionId;
  onError?: (hasError: string) => void;
}) {
  if (!file) {
    onError?.(t`You must select a file to upload.`);
    return;
  }

  if (!collectionId) {
    onError?.(t`You must select a collection to upload to.`);
    return;
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    onError?.(t`You cannot upload files larger than ${MAX_UPLOAD_STRING}`);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("collection_id", String(collectionId));

  await CardApi.uploadCSV(formData).catch(() =>
    onError?.(t`There was an error uploading your file.`),
  );
}
