import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "../InteractiveQuestion";

export type CreateQuestionProps = Partial<
  Omit<InteractiveQuestionProps, "questionId" | "children">
>;

export const CreateQuestion = (props: CreateQuestionProps = {}) => (
  <InteractiveQuestion {...props} />
);