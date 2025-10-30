import type { TransformId, TransformJobId } from "metabase-types/api";

export type TransformMoreMenuModalType = "delete";

export type TransformMoreMenuModalState = {
  transformId: TransformId;
  modalType: TransformMoreMenuModalType;
};

export type JobMoreMenuModalType = "delete";

export type JobMoreMenuModalState = {
  jobId: TransformJobId;
  modalType: JobMoreMenuModalType;
};
