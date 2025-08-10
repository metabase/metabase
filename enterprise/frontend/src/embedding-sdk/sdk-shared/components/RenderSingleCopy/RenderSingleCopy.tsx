import { type ReactNode, useEffect, useMemo, useRef } from "react";

import { useSingleCopyWrapperIds } from "embedding-sdk/sdk-shared/hooks/use-single-copy-wrapper-ids";

type RenderSingleCopyData = {
  singleCopyDetected: boolean;
  isSingleCopyToRender: boolean;
};

type Props = {
  children: ReactNode | ((data: RenderSingleCopyData) => ReactNode);
  identifier: string;
  multipleRegisteredInstancesWarningMessage?: string;
};

/**
 * A wrapper component that ensures only the first-mounted instance for a given `id` actually renders its children.
 *
 * This component:
 * Generates a unique component instance key (via `useId()`).
 * Registers itself in a `singleCopyIdsMap` on the first render:
 * Removes itself from that map on unmount.
 * Only the very first-registered instance for this `id` will render its `children`; all others return `null`.
 */
export const RenderSingleCopy = ({
  identifier,
  children,
  multipleRegisteredInstancesWarningMessage,
}: Props) => {
  const { singleCopyIdsMap, setSingleCopyIdsMap } = useSingleCopyWrapperIds();

  const currentInstanceIdRef = useRef(
    `${identifier}-${Math.random().toString(36).slice(2)}`,
  );

  const singleCopyIds = useMemo(
    () => (singleCopyIdsMap ?? {})[identifier] ?? [],
    [identifier, singleCopyIdsMap],
  );

  useEffect(() => {
    const currentInstanceId = currentInstanceIdRef.current;

    setSingleCopyIdsMap((singleCopyIdsMap) => {
      const idsOnMount = singleCopyIdsMap[identifier] ?? [];

      return {
        ...singleCopyIdsMap,
        [identifier]: !idsOnMount.includes(currentInstanceId)
          ? [...idsOnMount, currentInstanceId]
          : idsOnMount,
      };
    });

    return () => {
      setSingleCopyIdsMap((singleCopyIdsMap) => {
        const idsOnUnmount = singleCopyIdsMap[identifier] ?? [];

        return {
          ...singleCopyIdsMap,
          [identifier]: idsOnUnmount.filter(
            (instanceId) => instanceId !== currentInstanceId,
          ),
        };
      });
    };
  }, [identifier, currentInstanceIdRef, setSingleCopyIdsMap]);

  const singleCopyDetected = singleCopyIds.length > 0;
  const isSingleCopyToRender =
    singleCopyDetected && singleCopyIds[0] === currentInstanceIdRef.current;

  useEffect(
    function showWarningOnMultipleRegisteredInstances() {
      const shouldShowWaring =
        !!multipleRegisteredInstancesWarningMessage &&
        isSingleCopyToRender &&
        singleCopyIds.length > 1;

      if (shouldShowWaring) {
        console.warn(multipleRegisteredInstancesWarningMessage);
      }
    },
    [
      multipleRegisteredInstancesWarningMessage,
      isSingleCopyToRender,
      singleCopyIds,
    ],
  );

  const isChildrenAsFunction = typeof children === "function";

  if (isChildrenAsFunction) {
    return children({
      singleCopyDetected,
      isSingleCopyToRender,
    });
  }

  return isSingleCopyToRender ? children : null;
};
