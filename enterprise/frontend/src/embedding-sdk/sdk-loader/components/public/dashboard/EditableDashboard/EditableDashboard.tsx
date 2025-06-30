import type { EditableDashboardProps } from "embedding-sdk/components/public";

export const EditableDashboard = (props: EditableDashboardProps) => {
  const Component = window.MetabaseEmbeddingSDK?.EditableDashboard;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
