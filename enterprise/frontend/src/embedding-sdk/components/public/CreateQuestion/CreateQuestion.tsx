import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "../InteractiveQuestion";

export type CreateQuestionProps = Partial<
  Omit<InteractiveQuestionProps, "questionId" | "children">
>;

/** @deprecated Use `<InteractiveQuestion questionId="new" />` instead. */
export const CreateQuestion = (props: CreateQuestionProps = {}) => (
  <InteractiveQuestion {...props} questionId="new" />
);
