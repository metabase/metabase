import { useWaitForSdkBundle } from "embedding-sdk/sdk-loader/hooks/private/use-wait-for-sdk-bundle";

export const MetabotQuestion = () => {
  const { isLoading } = useWaitForSdkBundle();

  console.log(isLoading);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const Component = window.MetabaseEmbeddingSDK?.MetabotQuestion;

  if (!Component) {
    return null;
  }

  return <Component />;
};
