import { useEffect, useMemo, useRef } from "react";
import _ from "underscore";

import {
  skipToken,
  useGetActionQuery,
  useGetCardQuery,
  useGetCollectionQuery,
  useGetDashboardQuery,
  useGetDocumentQuery,
  useGetMeasureQuery,
  useGetSegmentQuery,
  useGetSnippetQuery,
  useGetTimelineEventQuery,
  useGetTimelineQuery,
  useGetTransformQuery,
} from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/common/data-studio/hooks/use-load-table-with-metadata";
import { setPrefetchedDashboard } from "metabase/dashboard/actions/core";
import { PLUGIN_DATA_TESTING } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import {
  type RouteObject,
  useLocation,
  useNavigate,
  useParams,
} from "metabase/router";
import * as Urls from "metabase/urls";
import { parseHashOptions, stringifyHashOptions } from "metabase/utils/browser";
import type {
  Dashboard,
  Table,
  TableId,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";
import {
  type BaseEntityId,
  isBaseEntityID,
} from "metabase-types/api/entity-id";

type EntityQueryResult<Entity> = {
  data?: Entity;
  error?: unknown;
  /** True while a request is on its way. */
  isFetching: boolean;
};

type SearchAndHash = {
  search: string;
  hash: string;
};

type EntityRedirectProps<Entity> = {
  useEntityQuery: (entityId: BaseEntityId) => EntityQueryResult<Entity>;
  /** Returns the entity's regular path, without a query string or a hash. */
  getUrl: (entity: Entity) => string;
  /**
   * Returns the query string and the hash to open the entity's URL with.
   * Returns undefined when they name something the entity does not have, which shows the not found page.
   * The ones in the address are kept when this is omitted.
   */
  getSearchAndHash?: (
    entity: Entity,
    searchAndHash: SearchAndHash,
  ) => SearchAndHash | undefined;
};

type LoadAndRedirectProps<Entity> = EntityRedirectProps<Entity> & {
  entityId: BaseEntityId;
  /** What follows the entity ID in the address, written as it is there. */
  subPath: string;
};

function LoadAndRedirect<Entity>({
  entityId,
  subPath,
  useEntityQuery,
  getUrl,
  getSearchAndHash,
}: LoadAndRedirectProps<Entity>) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { search, hash } = useLocation();
  const { data: entity, error, isFetching } = useEntityQuery(entityId);
  const hasRequestedRef = useRef(false);
  const searchAndHash = useMemo(() => {
    if (entity === undefined || getSearchAndHash === undefined) {
      return { search, hash };
    }
    return getSearchAndHash(entity, { search, hash });
  }, [entity, getSearchAndHash, hash, search]);

  useEffect(() => {
    if (entity !== undefined && searchAndHash !== undefined) {
      const entityUrl = getUrl(entity);
      const pathname = `${entityUrl}${subPath}`;
      navigate({ pathname, ...searchAndHash }, { replace: true });
    }
  }, [entity, getUrl, navigate, searchAndHash, subPath]);

  // An error kept from an earlier visit shows up before the request is sent again, so only an error that follows a request counts.
  useEffect(() => {
    if (isFetching) {
      hasRequestedRef.current = true;
    } else if (error && hasRequestedRef.current) {
      dispatch(setErrorPage(error));
    }
  }, [dispatch, error, isFetching]);

  if (searchAndHash === undefined) {
    return <NotFound />;
  }

  return <LoadingAndErrorWrapper loading />;
}

function EntityRedirect<Entity>(props: EntityRedirectProps<Entity>) {
  const { entityId } = useParams();
  const { pathname } = useLocation();

  if (!isBaseEntityID(entityId)) {
    return <NotFound />;
  }

  // The route parameter for the rest of the path is decoded, so the rest is cut from the address itself.
  const entityPath = `/entity/${entityId}`;
  const subPathStart = pathname.indexOf(entityPath) + entityPath.length;
  const subPath = pathname.slice(subPathStart);

  // Every entity route renders this component, and the key gives each address a loader of its own.
  return (
    <LoadAndRedirect
      {...props}
      key={pathname}
      entityId={entityId}
      subPath={subPath}
    />
  );
}

/**
 * Route element that loads an entity by the entity ID in the URL, then replaces the address with the entity's regular URL.
 * A sub-path after the entity ID, the query string and the hash are kept.
 * It shows the not found page when the value is not an entity ID.
 */
function createEntityRedirect<Entity>(config: EntityRedirectProps<Entity>) {
  return <EntityRedirect {...config} />;
}

/**
 * Swaps the tab and dashcard entity IDs in a dashboard address for their numeric IDs.
 * Returns undefined when the address names a tab the dashboard does not have.
 * A dashcard the dashboard does not have is dropped from the hash, since it only says where to scroll.
 */
function getDashboardSearchAndHash(
  dashboard: Dashboard,
  { search, hash }: SearchAndHash,
): SearchAndHash | undefined {
  const tabEntityId = new URLSearchParams(search).get("tab");
  const hashOptions = parseHashOptions(hash);
  const { scrollTo: dashcardEntityId } = hashOptions;
  let nextSearch = search;
  let nextHash = hash;

  if (isBaseEntityID(tabEntityId)) {
    const tab = dashboard.tabs?.find(
      ({ entity_id }) => entity_id === tabEntityId,
    );
    if (!tab) {
      return undefined;
    }
    nextSearch = search.replace(tabEntityId, String(tab.id));
  }

  if (isBaseEntityID(dashcardEntityId)) {
    const dashcard = dashboard.dashcards.find(
      ({ entity_id }) => entity_id === dashcardEntityId,
    );
    const nextHashOptions = dashcard
      ? { ...hashOptions, scrollTo: String(dashcard.id) }
      : _.omit(hashOptions, "scrollTo");
    const hashString = stringifyHashOptions(nextHashOptions);
    nextHash = hashString ? `#${hashString}` : "";
  }

  return { search: nextSearch, hash: nextHash };
}

type WithTable<Entity> = {
  entity: Entity;
  table: Table;
};

/** Adds the table of a loaded segment or measure, which its URL needs. */
function useWithTable<Entity extends { table_id: TableId }>({
  data: entity,
  error,
  isFetching,
}: EntityQueryResult<Entity>): EntityQueryResult<WithTable<Entity>> {
  const {
    table,
    error: tableError,
    isLoading: isTableLoading,
  } = useLoadTableWithMetadata(entity?.table_id);
  const data = useMemo(
    () => (entity && table ? { entity, table } : undefined),
    [entity, table],
  );

  return {
    data,
    error: error ?? tableError,
    isFetching: isFetching || isTableLoading,
  };
}

type TimelineEventWithTimeline = {
  event: TimelineEvent;
  timeline: Timeline;
};

/** Loads a timeline event by its entity ID together with its timeline, which the event's URL needs. */
function useTimelineEventWithTimeline(
  entityId: BaseEntityId,
): EntityQueryResult<TimelineEventWithTimeline> {
  const {
    data: event,
    error: eventError,
    isFetching: isEventFetching,
  } = useGetTimelineEventQuery(entityId);
  const {
    data: timeline,
    error: timelineError,
    isFetching: isTimelineFetching,
  } = useGetTimelineQuery(
    event ? { id: event.timeline_id, include: "events" } : skipToken,
  );
  const data = useMemo(
    () => (event && timeline ? { event, timeline } : undefined),
    [event, timeline],
  );

  return {
    data,
    error: eventError ?? timelineError,
    isFetching: isEventFetching || isTimelineFetching,
  };
}

/** Loads a dashboard by its entity ID and leaves it for the dashboard page, which loads its dashboard itself. */
function useHandedOverDashboard(
  entityId: BaseEntityId,
): EntityQueryResult<Dashboard> {
  const dispatch = useDispatch();
  const {
    data: dashboard,
    error,
    isFetching,
  } = useGetDashboardQuery({ id: entityId });

  useEffect(() => {
    if (dashboard) {
      dispatch(setPrefetchedDashboard(dashboard));
      // It is there only for the page this redirect opens.
      return () => {
        dispatch(setPrefetchedDashboard(null));
      };
    }
  }, [dashboard, dispatch]);

  return { data: dashboard, error, isFetching };
}

/** The app's `/<type>/entity/<entityId>` routes, one per kind of entity. */
export function getEntityIdRoutes(): RouteObject[] {
  // A card opens on the page for its own type, whichever of the two routes was used.
  const cardEntityRedirect = createEntityRedirect({
    useEntityQuery: (entityId) => useGetCardQuery({ id: entityId }),
    getUrl: (card) =>
      card.type === "metric" ? Urls.metric(card) : Urls.card(card),
  });

  return [
    {
      path: "question/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: (entityId) => useGetCardQuery({ id: entityId }),
        // This route has always landed on the bare address, and the query builder moves a model or a metric to its own page.
        getUrl: (card) => `/question/${card.id}`,
      }),
    },
    { path: "model/entity/:entityId/*", element: cardEntityRedirect },
    { path: "metric/entity/:entityId/*", element: cardEntityRedirect },
    {
      path: "dashboard/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: useHandedOverDashboard,
        getUrl: (dashboard) => `/dashboard/${dashboard.id}`,
        getSearchAndHash: getDashboardSearchAndHash,
      }),
    },
    {
      path: "collection/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: (entityId) => useGetCollectionQuery({ id: entityId }),
        getUrl: (collection) => `/collection/${collection.id}`,
      }),
    },
    {
      path: "document/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: (entityId) => useGetDocumentQuery({ id: entityId }),
        getUrl: Urls.document,
      }),
    },
    {
      path: "timeline/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: (entityId) =>
          useGetTimelineQuery({ id: entityId, include: "events" }),
        getUrl: Urls.timelineInCollection,
      }),
    },
    {
      path: "timeline-event/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: useTimelineEventWithTimeline,
        // An event has no page of its own: it opens in its edit form when the app offers one, and in its timeline otherwise.
        getUrl: ({ event, timeline }) => {
          const canEdit = timeline.collection?.can_write && !event.archived;
          return canEdit
            ? Urls.editEventInCollection(event, timeline)
            : Urls.timelineInCollection(timeline);
        },
      }),
    },
    {
      path: "transform/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: (entityId) => useGetTransformQuery(entityId),
        getUrl: (transform) => Urls.transform(transform.id),
      }),
    },
    ...(PLUGIN_DATA_TESTING.isEnabled
      ? [
          {
            path: "transform-test/entity/:entityId/*",
            element: createEntityRedirect({
              useEntityQuery: PLUGIN_DATA_TESTING.useGetTransformTestQuery,
              getUrl: (test) => Urls.transformTest(test.transform_id, test.id),
            }),
          },
        ]
      : []),
    {
      path: "snippet/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: (entityId) => useGetSnippetQuery(entityId),
        getUrl: (snippet) => Urls.dataStudioSnippet(snippet.id),
      }),
    },
    {
      path: "action/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: (entityId) => useGetActionQuery({ id: entityId }),
        getUrl: (action) => Urls.dataStudioAction(action.id),
      }),
    },
    {
      path: "segment/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: (entityId) => {
          const segmentResult = useGetSegmentQuery(entityId);
          return useWithTable(segmentResult);
        },
        getUrl: ({ entity: segment, table }) =>
          Urls.dataStudioDataModelSegment({
            databaseId: table.db_id,
            schemaName: table.schema,
            tableId: table.id,
            segmentId: segment.id,
          }),
      }),
    },
    {
      path: "measure/entity/:entityId/*",
      element: createEntityRedirect({
        useEntityQuery: (entityId) => {
          const measureResult = useGetMeasureQuery(entityId);
          return useWithTable(measureResult);
        },
        getUrl: ({ entity: measure, table }) =>
          Urls.dataStudioDataModelMeasure({
            databaseId: table.db_id,
            schemaName: table.schema,
            tableId: table.id,
            measureId: measure.id,
          }),
      }),
    },
  ];
}
