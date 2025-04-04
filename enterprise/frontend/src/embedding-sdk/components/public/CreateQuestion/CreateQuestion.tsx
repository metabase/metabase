import {
  type BaseInteractiveQuestionProps,
  InteractiveQuestion,
} from "../InteractiveQuestion";

/**
 * @interface
 */
export type CreateQuestionProps = Partial<
  Omit<BaseInteractiveQuestionProps, "questionId" | "children">
>;

/**
 * @deprecated Use `<InteractiveQuestion questionId="new" />` instead.
 *
 * @function
 * */
export const CreateQuestion = (props: CreateQuestionProps = {}) => (
  <InteractiveQuestion {...props} questionId="new" />
);
