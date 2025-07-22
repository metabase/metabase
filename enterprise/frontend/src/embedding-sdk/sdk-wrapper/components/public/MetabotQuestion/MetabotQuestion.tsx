import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * A component that renders a metabot question.
 *
 * @function
 * @category MetabotQuestion
 */
export const MetabotQuestion = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.MetabotQuestion,
);
