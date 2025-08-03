import { type PropsWithChildren, useEffect, useMemo, useRef } from "react";

import { useMetabaseProviderPropsStore } from "embedding-sdk/sdk-shared/hooks/use-metabase-provider-props-store";

type Props = {
  id: string;
  multipleRegisteredInstancesWarningMessage?: string;
};

/**
 * A wrapper component that ensures only the first-mounted instance for a given `id` actually renders its children.
 *
 * This component:
 * 1. Generates a unique instance key (via `useId()`).
 * 2. Registers itself in a shared `singleCopyWrapperIdsMap` inside the Metabase provider store on mount.
 * 3. Removes itself from that map on unmount.
 * 4. Once the store is initialized, only the very first-registered instance for this `id` will render its `children`; all others return `null`.
 */
export const RenderSingleCopy = ({
  id,
  children,
  multipleRegisteredInstancesWarningMessage,
}: PropsWithChildren<Props>) => {
  const currentIdRef = useRef(
    `single-copy-${Math.random().toString(36).slice(2)}`,
  );

  const { props: metabaseProviderProps, store } =
    useMetabaseProviderPropsStore();
  const { initialized, singleCopyWrapperIdsMap = {} } = metabaseProviderProps;

  const singleCopyWrapperIds = useMemo(
    () => singleCopyWrapperIdsMap[id] ?? [],
    [id, singleCopyWrapperIdsMap],
  );

  useEffect(() => {
    if (!store) {
      return;
    }

    const currentId = currentIdRef.current;

    const singleCopyWrapperIdsMap =
      store.getSnapshot().singleCopyWrapperIdsMap ?? {};
    const idsOnMount = singleCopyWrapperIdsMap[id] ?? [];

    store.updateInternalProps({
      singleCopyWrapperIdsMap: {
        ...singleCopyWrapperIdsMap,
        [id]: [...idsOnMount, currentId],
      },
    });

    return () => {
      const singleCopyWrapperIdsMap =
        store.getSnapshot().singleCopyWrapperIdsMap ?? {};
      const idsOnUnmount = singleCopyWrapperIdsMap[id] ?? [];

      store.updateInternalProps({
        singleCopyWrapperIdsMap: {
          ...singleCopyWrapperIdsMap,
          [id]: idsOnUnmount.filter((id) => id !== currentId),
        },
      });
    };
  }, [id, currentIdRef, store]);

  useEffect(
    function showWarningOnMultipleRegisteredInstances() {
      const shouldShowWaring =
        !!multipleRegisteredInstancesWarningMessage &&
        singleCopyWrapperIds.length > 1;

      if (shouldShowWaring) {
        console.warn(multipleRegisteredInstancesWarningMessage);
      }
    },
    [multipleRegisteredInstancesWarningMessage, singleCopyWrapperIds],
  );

  if (
    initialized &&
    singleCopyWrapperIds.length > 0 &&
    singleCopyWrapperIds[0] !== currentIdRef.current
  ) {
    return null;
  }

  return <>{children}</>;
};
