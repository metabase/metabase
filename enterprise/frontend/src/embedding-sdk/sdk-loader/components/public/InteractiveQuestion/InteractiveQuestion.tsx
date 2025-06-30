import type { InteractiveQuestionProps } from "embedding-sdk/components/public";

export const InteractiveQuestion = (props: InteractiveQuestionProps) => {
  const Component = window.MetabaseEmbeddingSDK?.InteractiveQuestion;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
