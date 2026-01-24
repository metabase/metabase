import type { TransformId } from "metabase-types/api";

export type TransformMoreMenuModalType = "delete" | "move";

export type TransformMoreMenuModalState = {
  transformId: TransformId;
  modalType: TransformMoreMenuModalType;
};
