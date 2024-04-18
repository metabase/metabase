import { useEmbeddingContext } from "embedding-sdk/context";
import { Loader } from "metabase/ui";

export const PublicComponentWrapper = ({
  children,
}: {
  children: JSX.Element;
}) => {
  const { loginStatus, isLoggedIn } = useEmbeddingContext();

  if (!isLoggedIn) {
    return null;
  }

  if (loginStatus?.status === "loading") {
    return <Loader data-testid="loading-spinner" />;
  }

  if (loginStatus?.status === "error") {
    return <div>{loginStatus.error.message}</div>;
  }

  return children;
};
