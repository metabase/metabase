import { type BaseSdkQuestionProps, SdkQuestion } from "../question";

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
  <SdkQuestion {...props} questionId="new" />
);
