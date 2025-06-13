import { type BaseQuestionProps, Question } from "../Question";

/**
 * @interface
 * @expand
 * @category CreateQuestion
 */
export type CreateQuestionProps = Omit<
  Partial<BaseQuestionProps>,
  "questionId" | "children"
>;

/**
 * @function
 * @category CreateQuestion
 * @deprecated Use `<Question questionId="new" />` instead.
 * */
export const CreateQuestion = (props: CreateQuestionProps = {}) => (
  <Question {...props} questionId="new" />
);
