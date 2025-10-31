import type { ModalState } from "metabase-types/store/modal";

export const createMockModalState = (
  opts?: Partial<ModalState>,
): ModalState => {
  return {
    id: null,
    props: null,
    ...opts,
  };
};
