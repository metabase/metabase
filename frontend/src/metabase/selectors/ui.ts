import type { State } from "metabase/redux/store";
import type { ModalState } from "metabase/redux/store/modal";

export const getCurrentOpenModalState = <TProps>(state: State) =>
  // Unjustified type cast. FIXME
  state.modal as ModalState<TProps>;
