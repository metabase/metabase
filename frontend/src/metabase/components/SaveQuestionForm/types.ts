import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

export type SaveQuestionProps = {
  question: Question;
  originalQuestion: Question | null;
  onCreate: (question: Question) => Promise<void>;
  onSave: (question: Question) => Promise<void>;

  closeOnSuccess?: boolean;
  multiStep?: boolean;

  /** If the collection picker is not shown, this becomes the target collection to save to. **/
  initialCollectionId?: CollectionId | null;
  withCollectionPicker?: boolean;
};

export type FormValues = {
  saveType: "overwrite" | "create";
  collection_id?: CollectionId | null;
  name: string;
  description: string;
};

export type UpdateQuestionOptions = {
  newQuestion: Question;
  originalQuestion: Question;
  onSave: (question: Question) => Promise<void>;
};

export type CreateQuestionOptions = {
  details: FormValues;
  question: Question;
  onCreate: (question: Question) => Promise<void>;
  initialCollectionId?: CollectionId | null;
};

export type SubmitQuestionOptions = CreateQuestionOptions & {
  originalQuestion: Question | null;
  onSave: (question: Question) => Promise<void>;
};
