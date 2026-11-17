export type ModalName =
  | null
  | "collection"
  | "dashboard"
  | "action"
  | "help"
  | "upgrade";

export type ModalState<TProps = Record<string, unknown>> = {
  id: ModalName;
  props: TProps | null;
};
