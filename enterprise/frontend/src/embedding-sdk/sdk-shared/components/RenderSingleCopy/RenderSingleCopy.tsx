import { type ReactNode, useEffect, useMemo } from "react";

import { useSingleCopyWrapperIds } from "embedding-sdk/sdk-shared/hooks/use-single-copy-wrapper-ids";

type RenderSingleCopyData = {
  isSingleCopyToRender: boolean;
};

type Props = {
  children: ReactNode | ((data: RenderSingleCopyData) => ReactNode);
  groupId: string;
  instanceId: string;
  multipleRegisteredInstancesWarningMessage?: string;
};

/**
 * A wrapper component that ensures only the first-mounted instance for a given `id` actually renders its children.
 *
 * This component:
 * Accepts a group id and a unique component instance id.
 * Registers itself in a `singleCopyIdsMap` on the first render.
 * Removes itself from that map on unmount.
 * Only the very first-registered instance for this `id` will render its `children`; all others return `null`.
 */
export const RenderSingleCopy = ({
  groupId,
  instanceId: currentInstanceId,
  children,
  multipleRegisteredInstancesWarningMessage,
}: Props) => {
  const { singleCopyIdsMap, setSingleCopyIdsMap } = useSingleCopyWrapperIds();

  if (singleCopyIdsMap && !singleCopyIdsMap[groupId]) {
    // Mutate the singleCopyIdsMap to ensure it has an entry to compare with during the first render
    singleCopyIdsMap[groupId] = [currentInstanceId];
  }

  const singleCopyIds = useMemo(
    () => (singleCopyIdsMap ?? {})[groupId] ?? [],
    [groupId, singleCopyIdsMap],
  );

  useEffect(() => {
    setSingleCopyIdsMap((singleCopyIdsMap) => {
      const idsOnMount = singleCopyIdsMap[groupId] ?? [];

      return {
        ...singleCopyIdsMap,
        [groupId]: !idsOnMount.includes(currentInstanceId)
          ? [...idsOnMount, currentInstanceId]
          : idsOnMount,
      };
    });

    return () => {
      setSingleCopyIdsMap((singleCopyIdsMap) => {
        const idsOnUnmount = singleCopyIdsMap[groupId] ?? [];

        return {
          ...singleCopyIdsMap,
          [groupId]: idsOnUnmount.filter(
            (instanceId) => instanceId !== currentInstanceId,
          ),
        };
      });
    };
  }, [groupId, currentInstanceId, setSingleCopyIdsMap]);

  const singleCopyDetected = singleCopyIds.length > 0;
  const isSingleCopyToRender =
    singleCopyDetected && singleCopyIds[0] === currentInstanceId;

  useEffect(
    function showWarningOnMultipleRegisteredInstances() {
      const shouldShowWarning =
        !!multipleRegisteredInstancesWarningMessage &&
        isSingleCopyToRender &&
        singleCopyIds.length > 1;

      if (shouldShowWarning) {
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
    return children({ isSingleCopyToRender });
  }

  return isSingleCopyToRender ? children : null;
};
