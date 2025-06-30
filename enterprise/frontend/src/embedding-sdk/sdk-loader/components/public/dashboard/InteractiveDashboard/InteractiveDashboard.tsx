import type { InteractiveDashboardProps } from "embedding-sdk/components/public";

export const InteractiveDashboard = (props: InteractiveDashboardProps) => {
  const Component = window.MetabaseEmbeddingSDK?.InteractiveDashboard;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
