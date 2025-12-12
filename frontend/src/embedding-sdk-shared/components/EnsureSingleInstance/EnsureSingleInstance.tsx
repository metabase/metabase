import { type ReactNode, useCallback, useEffect, useMemo } from "react";

import { useMetabaseProviderPropsStore } from "../../hooks/use-metabase-provider-props-store";

export const useSingleInstanceIdsData = () => {
  const {
    store,
    state: {
      internalProps: { singleInstanceIdsMap },
    },
  } = useMetabaseProviderPropsStore();

  const setSingleInstanceIdsMap = useCallback(
    (
      updateFn: (
        singleInstanceIdsMap: Record<string, string[]>,
      ) => Record<string, string[]>,
    ) => {
      const { singleInstanceIdsMap = {} } = store.getState().internalProps;

      store.updateInternalProps({
        singleInstanceIdsMap: updateFn(singleInstanceIdsMap),
      });
    },
    [store],
  );

  return { singleInstanceIdsMap, setSingleInstanceIdsMap };
};

type EnsureSingleInstanceData = {
  isInstanceToRender: boolean;
};

type Props = {
  children: ReactNode | ((data: EnsureSingleInstanceData) => ReactNode);
  groupId: string;
  instanceId: string;
  multipleRegisteredInstancesWarningMessage?: string;
};

/**
 * A wrapper component that ensures only the first-mounted instance for a given `id` actually renders its children.
 *
 * This component:
 * Accepts a group id and a unique component instance id.
 * Registers itself in a `singleInstanceIdsMap` on the first render.
 * Removes itself from that map on unmount.
 * Only the very first-registered instance for this `id` will render its `children`; all others return `null`.
 */
export const EnsureSingleInstance = ({
  groupId,
  instanceId: currentInstanceId,
  children,
  multipleRegisteredInstancesWarningMessage,
}: Props) => {
  const { singleInstanceIdsMap, setSingleInstanceIdsMap } =
    useSingleInstanceIdsData();

  if (singleInstanceIdsMap && !singleInstanceIdsMap[groupId]) {
    // Mutate the singleInstanceIdsMap to ensure it has an entry to compare with during the first render
    // It works with React StrictMode and does not cause any unexpected side effects,
    // but it requires the passing the `instanceId` from a parent component.
    singleInstanceIdsMap[groupId] = [currentInstanceId];
  }

  const singleInstanceIds = useMemo(
    () => (singleInstanceIdsMap ?? {})[groupId] ?? [],
    [groupId, singleInstanceIdsMap],
  );

  useEffect(() => {
    setSingleInstanceIdsMap((singleInstanceIdsMap) => {
      const idsOnMount = singleInstanceIdsMap[groupId] ?? [];

      return {
        ...singleInstanceIdsMap,
        [groupId]: !idsOnMount.includes(currentInstanceId)
          ? [...idsOnMount, currentInstanceId]
          : idsOnMount,
      };
    });

    return () => {
      setSingleInstanceIdsMap((singleInstanceIdsMap) => {
        const idsOnUnmount = singleInstanceIdsMap[groupId] ?? [];

        return {
          ...singleInstanceIdsMap,
          [groupId]: idsOnUnmount.filter(
            (instanceId) => instanceId !== currentInstanceId,
          ),
        };
      });
    };
  }, [groupId, currentInstanceId, setSingleInstanceIdsMap]);

  const initialized = singleInstanceIds.length > 0;
  const isInstanceToRender =
    initialized && singleInstanceIds[0] === currentInstanceId;

  useEffect(
    function showWarningOnMultipleRegisteredInstances() {
      const shouldShowWarning =
        !!multipleRegisteredInstancesWarningMessage &&
        isInstanceToRender &&
        singleInstanceIds.length > 1;

      if (shouldShowWarning) {
        console.warn(multipleRegisteredInstancesWarningMessage);
      }
    },
    [
      multipleRegisteredInstancesWarningMessage,
      isInstanceToRender,
      singleInstanceIds,
    ],
  );

  const isChildrenAsFunction = typeof children === "function";

  if (isChildrenAsFunction) {
    return children({ isInstanceToRender });
  }

  return isInstanceToRender ? children : null;
};
