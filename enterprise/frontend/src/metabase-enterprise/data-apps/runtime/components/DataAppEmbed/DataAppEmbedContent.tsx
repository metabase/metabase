import { useEffect } from "react";

import { useSdkSelector } from "embedding-sdk-bundle/store";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import type { DataAppMetabaseProviderProps } from "embedding-sdk-package/data-app";
import { SdkIframeError } from "metabase/embedding/embedding-iframe-sdk/components/SdkIframeError";
import { Center, Loader } from "metabase/ui";

import { useDataAppBundle } from "../../lib/use-data-app-bundle";
import { BundleErrorBoundary } from "../DataAppIframeApp/DataAppIframeApp";

import { useDataAppPathNavigation } from "./hooks/use-data-app-path-navigation";

type Props = {
  name: string;
  path: string;

  onProviderPropsLoaded: (props: DataAppMetabaseProviderProps) => void;
};

export function DataAppEmbedContent({
  name,
  path,
  onProviderPropsLoaded,
}: Props) {
  const loginStatus = useSdkSelector(getLoginStatus);

  if (loginStatus.status === "error") {
    return <SdkIframeError message={loginStatus.error.message} />;
  }

  if (loginStatus.status !== "success") {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  return (
    <DataAppEmbedAuthenticatedView
      name={name}
      path={path}
      onProviderPropsLoaded={onProviderPropsLoaded}
    />
  );
}

function DataAppEmbedAuthenticatedView({
  name,
  path,
  onProviderPropsLoaded,
}: Props) {
  const { data, failed, error } = useDataAppBundle(name, { embedded: true });

  useDataAppPathNavigation({ name, path });

  useEffect(() => {
    if (data) {
      onProviderPropsLoaded(data.providerProps);
    }
  }, [data, onProviderPropsLoaded]);

  if (failed) {
    return (
      <SdkIframeError message={error ?? "Unable to load this data app."} />
    );
  }

  if (!data) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  const App = data.component;

  return (
    <BundleErrorBoundary embedded>
      <App />
    </BundleErrorBoundary>
  );
}
