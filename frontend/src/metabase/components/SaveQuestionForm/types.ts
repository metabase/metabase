import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

export type SaveQuestionProps = {
  question: Question;
  originalQuestion: Question | null;
  onCreate: (question: Question) => Promise<void>;
  onSave: (question: Question) => Promise<void>;

  closeOnSuccess?: boolean;
  multiStep?: boolean;
  initialCollectionId?: CollectionId | null;

  /**
   * The target collection to save the question to.
   * Currently used for the embedding SDK.
   *
   * When this is defined, the collection picker will be hidden and
   * the question will be saved to this collection.
   **/
  saveToCollectionId?: CollectionId;
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
} & Pick<SaveQuestionProps, "saveToCollectionId">;

export type SubmitQuestionOptions = CreateQuestionOptions & {
  originalQuestion: Question | null;
  onSave: (question: Question) => Promise<void>;
};
