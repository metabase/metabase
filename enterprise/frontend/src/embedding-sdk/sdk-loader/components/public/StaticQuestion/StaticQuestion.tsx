import type { StaticQuestionProps } from "embedding-sdk/components/public";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-wait-for-sdk-bundle";

export const StaticQuestion = (props: StaticQuestionProps) => {
  const { isLoading } = useWaitForSdkBundle();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const Component = window.MetabaseEmbeddingSDK?.StaticQuestion;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
