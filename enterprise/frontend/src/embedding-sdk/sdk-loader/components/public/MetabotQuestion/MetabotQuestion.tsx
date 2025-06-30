export const MetabotQuestion = () => {
  const Component = window.MetabaseEmbeddingSDK?.MetabotQuestion;

  if (!Component) {
    return null;
  }

  return <Component />;
};
