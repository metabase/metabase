import { SdkError } from "embedding-sdk/components/private/SdkError";
import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus } from "embedding-sdk/store/selectors";

export const PublicComponentWrapper = ({
  children,
}: {
  children: JSX.Element;
}) => {
  const loginStatus = useSdkSelector(getLoginStatus);

  if (loginStatus.status === "uninitialized") {
    return <div>Initializing…</div>;
  }

  if (loginStatus.status === "loading") {
    return <div>Loading…</div>;
  }

  if (loginStatus.status === "error") {
    return <SdkError />;
  }

  return children;
};
