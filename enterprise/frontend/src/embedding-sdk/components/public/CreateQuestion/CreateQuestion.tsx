import { type BaseSdkQuestionProps, InteractiveQuestion } from "../SdkQuestion";

/**
 * @interface
 * @expand
 * @category CreateQuestion
 */
export type CreateQuestionProps = Omit<
  Partial<BaseSdkQuestionProps>,
  "questionId" | "children"
>;

/**
 * @function
 * @category CreateQuestion
 * @deprecated Use `<InteractiveQuestion questionId="new" />` instead.
 * */
export const CreateQuestion = (props: CreateQuestionProps = {}) => (
  <InteractiveQuestion {...props} questionId="new" />
);
