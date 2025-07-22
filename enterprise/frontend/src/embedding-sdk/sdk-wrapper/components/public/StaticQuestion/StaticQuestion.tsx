import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * A component that renders a static question.
 *
 * @function
 * @category StaticQuestion
 */
export const StaticQuestion = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.StaticQuestion,
);
