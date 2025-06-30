import { createComponent } from "embedding-sdk/sdk-wrapper/components/private/ComponentWrapper/ComponentWrapper";

/**
 * @function
 * @category CreateQuestion
 * @deprecated Use `<InteractiveQuestion questionId="new" />` instead.
 * */
export const CreateQuestion = createComponent(
  () => window.MetabaseEmbeddingSDK?.CreateQuestion,
);
