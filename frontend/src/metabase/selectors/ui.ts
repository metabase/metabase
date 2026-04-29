import type { State } from "metabase/redux/store";
import type { ModalState } from "metabase/redux/store/modal";

export const getCurrentOpenModalState = <TProps>(state: State) =>
  state.modal as ModalState<TProps>;
