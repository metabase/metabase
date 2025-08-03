import { type PropsWithChildren, useEffect, useMemo, useRef } from "react";

import { useSingleCopyWrapperIds } from "embedding-sdk/sdk-shared/hooks/use-single-copy-wrapper-ids";

type Props = {
  id: string;
  multipleRegisteredInstancesWarningMessage?: string;
};

/**
 * A wrapper component that ensures only the first-mounted instance for a given `id` actually renders its children.
 *
 * This component:
 * 1. Generates a unique instance key (via `useId()`).
 * 2. Registers itself in a passed `singleCopyWrapperIdsMap` on mount.
 * 3. Removes itself from that map on unmount.
 * 4. Only the very first-registered instance for this `id` will render its `children`; all others return `null`.
 */
export const RenderSingleCopy = ({
  id,
  children,
  multipleRegisteredInstancesWarningMessage,
}: PropsWithChildren<Props>) => {
  const { singleCopyIdsMap, setSingleCopyIdsMap } = useSingleCopyWrapperIds();

  const currentIdRef = useRef(
    `single-copy-${id}-${Math.random().toString(36).slice(2)}`,
  );

  const singleCopyIds = useMemo(
    () => (singleCopyIdsMap ?? {})[id] ?? [],
    [id, singleCopyIdsMap],
  );

  useEffect(() => {
    const currentId = currentIdRef.current;

    setSingleCopyIdsMap((singleCopyIdsMap) => {
      const idsOnMount = singleCopyIdsMap[id] ?? [];

      return {
        ...singleCopyIdsMap,
        [id]: [...idsOnMount, currentId],
      };
    });

    return () => {
      setSingleCopyIdsMap((singleCopyIdsMap) => {
        const idsOnUnmount = singleCopyIdsMap[id] ?? [];

        return {
          ...singleCopyIdsMap,
          [id]: idsOnUnmount.filter((id) => id !== currentId),
        };
      });
    };
  }, [id, currentIdRef, setSingleCopyIdsMap]);

  const shouldRender = singleCopyIds[0] === currentIdRef.current;

  useEffect(
    function showWarningOnMultipleRegisteredInstances() {
      const shouldShowWaring =
        !!multipleRegisteredInstancesWarningMessage &&
        shouldRender &&
        singleCopyIds.length > 1;

      if (shouldShowWaring) {
        console.warn(multipleRegisteredInstancesWarningMessage);
      }
    },
    [multipleRegisteredInstancesWarningMessage, shouldRender, singleCopyIds],
  );

  if (!shouldRender) {
    return null;
  }

  return <>{children}</>;
};
