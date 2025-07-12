import type { InteractiveQuestionProps } from "embedding-sdk/components/public";
import { useWaitForSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-wait-for-sdk-bundle";

export const InteractiveQuestion = (props: InteractiveQuestionProps) => {
  const { isLoading } = useWaitForSdkBundle();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const Component = window.MetabaseEmbeddingSDK?.InteractiveQuestion;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
