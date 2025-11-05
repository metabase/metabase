import { withStaticNotAllowedGuard } from "embedding-sdk-bundle/components/private/StaticEmbeddingNotAllowedGuard";

import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "../InteractiveQuestion";

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

export const CreateQuestion = withStaticNotAllowedGuard(
  CreateQuestionInner,
) as typeof CreateQuestionInner;
