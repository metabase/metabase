import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * A component that renders a metabot question.
 *
 * @function
 * @category MetabotQuestion
 */
export const MetabotQuestion = createComponent(
  () => window.MetabaseEmbeddingSDK?.MetabotQuestion,
);
