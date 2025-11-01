import type { TransformId } from "metabase-types/api";

export type TransformMoreMenuModalType = "delete";

export type TransformMoreMenuModalState = {
  transformId: TransformId;
  modalType: TransformMoreMenuModalType;
};
