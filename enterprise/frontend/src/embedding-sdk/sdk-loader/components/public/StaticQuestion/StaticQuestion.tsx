import type { StaticQuestionProps } from "embedding-sdk/components/public";

export const StaticQuestion = (props: StaticQuestionProps) => {
  const Component = window.MetabaseEmbeddingSDK?.StaticQuestion;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
