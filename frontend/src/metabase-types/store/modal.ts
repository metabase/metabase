import type { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";

export type ModalName =
  | null
  | "collection"
  | "dashboard"
  | "action"
  | "help"
  | "embed"
  | "upgrade"
  | typeof STATIC_LEGACY_EMBEDDING_TYPE;

export type ModalState<TProps = Record<string, unknown>> = {
  id: ModalName | null;
  props: TProps | null;
};
