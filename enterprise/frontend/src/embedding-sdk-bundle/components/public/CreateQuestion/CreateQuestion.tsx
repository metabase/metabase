import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "../InteractiveQuestion";

import { createQuestionSchema } from "./CreateQuestion.schema";

/**
 * @interface
 * @expand
 * @category CreateQuestion
 */
export type CreateQuestionProps = Omit<
  Partial<InteractiveQuestionProps>,
  "questionId" | "children"
>;

const CreateQuestionInner = (props: CreateQuestionProps = {}) => (
  <InteractiveQuestion {...props} questionId="new" />
);

export const CreateQuestion = Object.assign(CreateQuestionInner, {
  schema: createQuestionSchema,
});
