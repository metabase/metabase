import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

/**
 * A component that renders a metabot question.
 *
 * @function
 * @category MetabotQuestion
 */
export const MetabotQuestion = createComponent(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.MetabotQuestion,
);
