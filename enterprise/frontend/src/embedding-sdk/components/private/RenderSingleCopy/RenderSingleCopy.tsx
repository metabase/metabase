import { type PropsWithChildren, useEffect, useId } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";

export const RenderSingleCopy = ({ children }: PropsWithChildren) => {
  const currentId = useId();
  const { props: metabaseProviderProps, store } =
    useMetabaseProviderPropsStore();
  const { initialized, singleCopyWrapperIds = [] } = metabaseProviderProps;

  useEffect(() => {
    const idsOnMount = store?.getSnapshot()?.singleCopyWrapperIds ?? [];

    store?.updateInternalProps({
      singleCopyWrapperIds: [...idsOnMount, currentId],
    });

    return () => {
      const idsOnUnmount = store?.getSnapshot()?.singleCopyWrapperIds ?? [];

      store?.updateInternalProps({
        singleCopyWrapperIds: idsOnUnmount.filter((id) => id !== currentId),
      });
    };
  }, [currentId, store]);

  if (initialized && singleCopyWrapperIds[0] !== currentId) {
    return null;
  }

  return <>{children}</>;
};
