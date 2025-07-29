import { type PropsWithChildren, useEffect } from "react";

import {
  type MetabaseProviderPropsStoreExternalProps,
  type MetabaseProviderPropsStoreInternalProps,
  ensureMetabaseProviderPropsStore,
} from "embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store";
import { useInitializeMetabaseProviderPropsStore } from "embedding-sdk/sdk-wrapper/hooks/private/use-initialize-metabase-provider-props-store";

type Props = {
  className?: string;
  reduxStore?: MetabaseProviderPropsStoreInternalProps["reduxStore"] | null;
  props: MetabaseProviderPropsStoreExternalProps;
};

export function MetabaseProviderInner({
  reduxStore,
  props,
  children,
}: PropsWithChildren<Props>) {
  useInitializeMetabaseProviderPropsStore(props, reduxStore);

  useEffect(() => {
    ensureMetabaseProviderPropsStore().setProps(props);
  }, [props]);

  return <>{children}</>;
}
