export type ModalName =
  | null
  | "collection"
  | "dashboard"
  | "action"
  | "help"
  | "embed";

export type ModalState = {
  id: ModalName | null;
  props: Record<string, unknown> | null;
};
