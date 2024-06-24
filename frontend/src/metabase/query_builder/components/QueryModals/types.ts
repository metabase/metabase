import type { MODAL_TYPES } from "metabase/query_builder/constants";

export type ModalType = typeof MODAL_TYPES[keyof typeof MODAL_TYPES];
