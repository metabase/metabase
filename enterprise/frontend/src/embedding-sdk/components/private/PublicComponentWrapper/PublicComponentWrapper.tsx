import type { ComponentType } from "react";
import { t } from "ttag";

import { SdkError } from "embedding-sdk/components/private/SdkError";
import { useSdkSelector } from "embedding-sdk/store";
import { getLoginStatus } from "embedding-sdk/store/selectors";
import { Loader } from "metabase/ui";

export const PublicComponentWrapper = ({
  children,
}: {
  children: JSX.Element;
}) => {
  const loginStatus = useSdkSelector(getLoginStatus);

  if (loginStatus.status === "uninitialized") {
    return <div>{t`Initializing…`}</div>;
  }

  if (loginStatus.status === "initialized") {
    return <div>{t`API Key / JWT is valid.`}</div>;
  }

  if (loginStatus.status === "loading") {
    return <Loader data-testid="loading-spinner" />;
  }

  if (loginStatus.status === "error") {
    return <SdkError message={loginStatus.error.message} />;
  }

  return children;
};

export function withPublicComponentWrapper<P>(
  WrappedComponent: ComponentType<P>,
): React.FC<P> {
  const WithPublicComponentWrapper: React.FC<P> = props => {
    return (
      <PublicComponentWrapper>
        <WrappedComponent {...props} />
      </PublicComponentWrapper>
    );
  };

  WithPublicComponentWrapper.displayName = `withPublicComponentWrapper(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return WithPublicComponentWrapper;
}
