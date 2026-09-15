import { useElementSize } from "@mantine/hooks";
import type { SortingState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { useLocation, useNavigate, useParams } from "metabase/router";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useLazyListSessionsQuery } from "metabase-enterprise/api";
import type { AdminSessionId } from "metabase-types/api";

import { SIDEBAR_WIDTH, SessionDetailSidebar } from "../SessionDetailSidebar";
import { SessionsTable } from "../SessionsTable";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  PAGE_SIZE,
  SORT_COLUMN_VALUES,
} from "./constants";
import type { RouteParams } from "./types";
import { buildListParams, urlStateConfig } from "./utils";

export const SessionsPage = () => {
  usePageTitle(t`Session management`);

  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId } = useParams<RouteParams>();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);

  const { data, isLoading, isFetching, error } = useAbortableQuery(
    useLazyListSessionsQuery,
    buildListParams(urlState, PAGE_SIZE),
  );
  const sessions = useMemo(() => data?.data ?? [], [data?.data]);
  const total = data?.total ?? 0;

  const sorting: SortingState = [
    {
      id: urlState.sort_column,
      desc: urlState.sort_direction === "desc",
    },
  ];

  const handleSortingChange = useCallback(
    (next: SortingState) => {
      if (next.length === 0) {
        patchUrlState({
          sort_column: DEFAULT_SORT_COLUMN,
          sort_direction: DEFAULT_SORT_DIRECTION,
          page: 0,
        });
        return;
      }
      const [first] = next;
      const column = SORT_COLUMN_VALUES.find((value) => value === first.id);
      if (column === undefined) {
        return;
      }
      patchUrlState({
        sort_column: column,
        sort_direction: first.desc ? "desc" : "asc",
        page: 0,
      });
    },
    [patchUrlState],
  );

  // Keep page and sort in the URL while the sidebar opens, closes, and steps between sessions
  const navigateToSession = useCallback(
    (id: AdminSessionId | undefined) => {
      navigate({
        pathname:
          id === undefined
            ? Urls.monitorSessions()
            : Urls.monitorSessionDetail(id),
        search: location.search,
      });
    },
    [navigate, location.search],
  );

  const handleSidebarClose = useCallback(
    () => navigateToSession(undefined),
    [navigateToSession],
  );

  const { prevSessionId, nextSessionId, sessionFromPage } = useMemo(() => {
    const index =
      sessionId === undefined
        ? -1
        : sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) {
      return {
        prevSessionId: undefined,
        nextSessionId: undefined,
        sessionFromPage: undefined,
      };
    }
    return {
      prevSessionId: index > 0 ? sessions[index - 1].id : undefined,
      nextSessionId:
        index < sessions.length - 1 ? sessions[index + 1].id : undefined,
      sessionFromPage: sessions[index],
    };
  }, [sessionId, sessions]);

  return (
    <Flex ref={containerRef} h="100%" wrap="nowrap">
      <MonitorMain>
        <MonitorHeaderTitle mb="sm">{t`Session management`}</MonitorHeaderTitle>

        <SessionsTable
          sessions={sessions}
          error={error}
          isFetching={isFetching}
          isLoading={isLoading}
          page={urlState.page}
          selectedSessionId={sessionId}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          onRowClick={navigateToSession}
        />

        {!isLoading && error === undefined && (
          <Flex justify="end">
            <PaginationControls
              page={urlState.page}
              pageSize={PAGE_SIZE}
              itemsLength={sessions.length}
              total={total}
              showTotal
              onPreviousPage={() =>
                patchUrlState({ page: urlState.page - 1 }, { immediate: true })
              }
              onNextPage={() =>
                patchUrlState({ page: urlState.page + 1 }, { immediate: true })
              }
            />
          </Flex>
        )}
      </MonitorMain>

      {sessionId !== undefined && (
        <Sidebar containerWidth={containerWidth} defaultWidth={SIDEBAR_WIDTH}>
          <SessionDetailSidebar
            sessionId={sessionId}
            sessionFromPage={sessionFromPage}
            prevSessionId={prevSessionId}
            nextSessionId={nextSessionId}
            onNavigate={navigateToSession}
            onClose={handleSidebarClose}
          />
        </Sidebar>
      )}
    </Flex>
  );
};
