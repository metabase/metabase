import {
  type BaseInteractiveQuestionProps,
  InteractiveQuestion,
} from "../InteractiveQuestion";

/**
 * @interface
 * @category CreateQuestion
 */
export type CreateQuestionProps = Partial<
  Omit<BaseInteractiveQuestionProps, "questionId" | "children">
>;

/**
 * @function
 * @category CreateQuestion
 * @deprecated Use `<InteractiveQuestion questionId="new" />` instead.
 * */
export const CreateQuestion = (props: CreateQuestionProps = {}) => (
  <InteractiveQuestion {...props} questionId="new" />
);
