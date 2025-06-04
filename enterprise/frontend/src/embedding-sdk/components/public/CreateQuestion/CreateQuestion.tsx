import type { SdkFunctionalComponent } from "embedding-sdk/types/react";

import {
  type BaseInteractiveQuestionProps,
  InteractiveQuestion,
} from "../InteractiveQuestion";

/**
 * @interface
 * @expand
 * @category CreateQuestion
 */
export type CreateQuestionProps = Omit<
  Partial<BaseInteractiveQuestionProps>,
  "questionId" | "children"
>;

/**
 * @function
 * @category CreateQuestion
 * @deprecated Use `<InteractiveQuestion questionId="new" />` instead.
 * */
export const CreateQuestion: SdkFunctionalComponent<CreateQuestionProps> = (
  props: CreateQuestionProps = {},
) => <InteractiveQuestion {...props} questionId="new" />;
