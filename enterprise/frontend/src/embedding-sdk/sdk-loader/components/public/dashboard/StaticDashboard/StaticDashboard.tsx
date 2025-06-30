import type { StaticDashboardProps } from "embedding-sdk/components/public";

export const StaticDashboard = (props: StaticDashboardProps) => {
  const Component = window.MetabaseEmbeddingSDK?.StaticDashboard;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
