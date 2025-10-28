import type { State } from "metabase-types/store";

export const currentOpenModalState = (state: State) => state.modal;
export const currentOpenModal = (state: State) => state.modal.id;
