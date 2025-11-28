import { withPublicComponentWrapper } from "embedding-sdk-bundle/components/private/PublicComponentWrapper";

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

export const CreateQuestion = withPublicComponentWrapper(CreateQuestionInner, {
  supportsGuestEmbed: false,
}) as typeof CreateQuestionInner;
