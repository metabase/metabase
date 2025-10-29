import type { State } from "metabase-types/store";
import type { ModalState } from "metabase-types/store/modal";

export const currentOpenModalState = <TProps>(state: State) =>
  state.modal as ModalState<TProps>;
export const currentOpenModal = (state: State) => state.modal.id;
