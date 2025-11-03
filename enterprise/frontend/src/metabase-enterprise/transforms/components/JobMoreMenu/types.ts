import type { TransformJobId } from "metabase-types/api";

export type JobMoreMenuModalType = "delete";

export type JobMoreMenuModalState = {
  jobId: TransformJobId;
  modalType: JobMoreMenuModalType;
};
