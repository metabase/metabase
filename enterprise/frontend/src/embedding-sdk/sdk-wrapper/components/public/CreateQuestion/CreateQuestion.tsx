import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";
import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * @function
 * @category CreateQuestion
 * @deprecated Use `<InteractiveQuestion questionId="new" />` instead.
 * */
export const CreateQuestion = createComponent(
  () => getWindow()?.MetabaseEmbeddingSDK?.CreateQuestion,
);
