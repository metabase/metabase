import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "../InteractiveQuestion";

export type CreateQuestionProps = Partial<
  Omit<InteractiveQuestionProps, "questionId" | "children">
>;

/** @deprecated Use `InteractiveQuestion` with `questionId="new"` and with `isSaveEnabled={true}` instead. */
export const CreateQuestion = (props: CreateQuestionProps = {}) => (
  <InteractiveQuestion {...props} questionId="new" />
);
