import type { FileUpload } from "metabase/redux/store/upload";

export const createMockUploadState = (uploads = {}) => {
  return { ...uploads };
};

export const createMockUpload = (props?: Partial<FileUpload>): FileUpload => {
  return {
    id: Date.now(),
    name: "test.csv",
    status: "in-progress",
    collectionId: "root",
    ...props,
  };
};
