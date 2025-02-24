import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "../InteractiveQuestion";

export type CreateQuestionProps = Partial<
  Omit<InteractiveQuestionProps, "questionId" | "children">
>;

export const CreateQuestion = ({
  onSave,
  isSaveEnabled = true,
  ...props
}: CreateQuestionProps = {}) => (
  <InteractiveQuestion {...props} isSaveEnabled={isSaveEnabled} />
);
