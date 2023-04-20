import { FileUpload } from "../upload";

export const createMockUploadState = () => {
  return {};
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
