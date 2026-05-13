import { useCallback, useMemo, useRef } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/redux";
import type { Exploration, TimelineId } from "metabase-types/api";

import {
  type ExplorationPageProps,
  GROUP_QUERY_PARAM,
  type SelectedEntity,
} from "../pages/ExplorationPage";

type UseExplorationUrlParams = Pick<
  ExplorationPageProps,
  "params" | "location"
> & {
  exploration: Exploration | undefined;
};

interface UseExplorationUrlResult {
  selectedEntity: SelectedEntity | null;
  setSelectedEntity: (entity: SelectedEntity) => void;
  selectedTimelineId: TimelineId | null;
  setSelectedTimelineId: (timelineId: TimelineId | null) => void;
}

export function useExplorationUrl({
  exploration,
  params,
  location,
}: UseExplorationUrlParams): UseExplorationUrlResult {
  const dispatch = useDispatch();

  // group ids are quite long, so we create shorter ids to use for the URL
  const groupIdToUrlIdMapRef = useRef(new Map<string, string>());
  const nextUrlIdRef = useRef(0);
  const groupIdToUrlIdMap = useMemo(() => {
    const newMap = new Map(groupIdToUrlIdMapRef.current);
    const groupIds = (exploration?.threads ?? []).flatMap((thread) =>
      (thread.groups ?? []).map((group) => group.id),
    );
    for (const groupId of groupIds) {
      if (!newMap.has(groupId)) {
        newMap.set(groupId, String(nextUrlIdRef.current++));
      }
    }
    groupIdToUrlIdMapRef.current = newMap;
    return newMap;
  }, [exploration]);
  const urlIdToGroupIdMap = useMemo(() => {
    return new Map(
      Array.from(groupIdToUrlIdMap.entries()).map(([groupId, urlId]) => [
        urlId,
        groupId,
      ]),
    );
  }, [groupIdToUrlIdMap]);

  const selectedEntity: SelectedEntity | null = useMemo(() => {
    if (params.entityType === "document") {
      return { type: "document", id: Number(params.entityId) };
    }

    const groupQueryParam = location.query?.[GROUP_QUERY_PARAM];
    if (groupQueryParam) {
      const groupIds = groupQueryParam
        .split(",")
        .map((urlId) => urlIdToGroupIdMap.get(urlId))
        .filter((groupId) => groupId !== undefined);
      return {
        type: "group",
        ids: groupIds,
      };
    }

    // the URL indicates whether the user has selected an entity
    // but if not, fallback to the first group
    // we deliberately do not push the auto-derived selection into the URL
    // that way it will continue to update and follow the most interesting chart as new data lands
    const firstGroupId = exploration?.threads?.[0]?.groups?.[0]?.id;
    if (firstGroupId) {
      return { type: "group", ids: [firstGroupId] };
    }
    return null;
  }, [
    params.entityType,
    params.entityId,
    exploration,
    location.query,
    urlIdToGroupIdMap,
  ]);

  const setSelectedEntity = useCallback(
    (entity: SelectedEntity) => {
      if (entity.type === "document") {
        dispatch(push(`/explorations/${params.id}/document/${entity.id}`));
      } else {
        const groupUrlIds = entity.ids
          .map((id) => groupIdToUrlIdMap.get(id))
          .filter((urlId): urlId is string => urlId !== undefined);
        dispatch(
          push({
            pathname: `/explorations/${params.id}`,
            query: {
              ...location.query,
              [GROUP_QUERY_PARAM]: groupUrlIds.join(","),
            },
          }),
        );
      }
    },
    [dispatch, groupIdToUrlIdMap, location.query, params.id],
  );

  return {
    selectedEntity,
    setSelectedEntity,
    selectedTimelineId: null,
    setSelectedTimelineId: () => {},
  };
}
