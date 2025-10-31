import type { State } from "metabase-types/store";
import type { ModalState } from "metabase-types/store/modal";

export const getCurrentOpenModalState = <TProps>(state: State) =>
  state.modal as ModalState<TProps>;
export const getCurrentOpenModal = (state: State) => state.modal.id;
