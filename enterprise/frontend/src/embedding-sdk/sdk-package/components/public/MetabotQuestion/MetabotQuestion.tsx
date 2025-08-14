import { createComponent } from "embedding-sdk/sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

/**
 * A component that renders a metabot question.
 *
 * @function
 * @category MetabotQuestion
 */
export const MetabotQuestion = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.MetabotQuestion,
);
