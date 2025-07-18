import { type BaseInteractiveQuestionProps, SdkQuestion } from "../SdkQuestion";

/**
 * @interface
 * @expand
 * @category CreateQuestion
 */
export type CreateQuestionProps = Omit<
  Partial<BaseInteractiveQuestionProps>,
  "questionId" | "children"
>;

export const CreateQuestion = (props: CreateQuestionProps = {}) => (
  <SdkQuestion {...props} questionId="new" />
);
