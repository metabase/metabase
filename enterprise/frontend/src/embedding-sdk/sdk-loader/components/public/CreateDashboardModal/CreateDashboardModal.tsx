import type { CreateDashboardModalProps } from "embedding-sdk/components/public";

export const CreateDashboardModal = (props: CreateDashboardModalProps) => {
  const Component = window.MetabaseEmbeddingSDK?.CreateDashboardModal;

  if (!Component) {
    return null;
  }

  return <Component {...props} />;
};
