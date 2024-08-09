import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

export type SaveQuestionModalProps = {
  question: Question;
  originalQuestion: Question | null;
  onCreate: (question: Question) => Promise<void>;
  onSave: (question: Question) => Promise<void>;
  onClose: () => void;
  multiStep?: boolean;
  initialCollectionId?: CollectionId | null;
};

export type FormValues = {
  saveType: "overwrite" | "create";
  collection_id: CollectionId | null | undefined;
  name: string;
  description: string;
};

export type SaveQuestionFormProps = {
  values: FormValues;
  showSaveType: boolean;
  placeholder: string;
} & Pick<SaveQuestionModalProps, "originalQuestion" | "onClose">;
