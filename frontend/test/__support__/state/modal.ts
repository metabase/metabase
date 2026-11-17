import type { ModalState } from "metabase/redux/store/modal";

export const createMockModalState = (
  opts?: Partial<ModalState>,
): ModalState => {
  return {
    id: null,
    props: null,
    ...opts,
  };
};
