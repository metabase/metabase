export type ModalName =
  | null
  | "collection"
  | "dashboard"
  | "action"
  | "help"
  | "embed";

export type ModalState<TProps = Record<string, unknown>> = {
  id: ModalName | null;
  props: TProps | null;
};
