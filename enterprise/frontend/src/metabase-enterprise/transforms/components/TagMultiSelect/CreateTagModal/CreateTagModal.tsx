import type { TransformTag } from "metabase-types/api";

type CreateTagModalProps = {
  searchValue: string;
  onCreate: (tag: TransformTag) => void;
  onClose: () => void;
};

export function CreateTagModal(_props: CreateTagModalProps) {
  return null;
}
