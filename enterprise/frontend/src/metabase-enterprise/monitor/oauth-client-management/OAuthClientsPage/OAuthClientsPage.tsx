import { useElementSize } from "@mantine/hooks";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { skipToken, useGetUserQuery } from "metabase/api";
import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { DebouncedSearchInput } from "metabase/common/components/DebouncedSearchInput";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import type { UserOption } from "metabase/common/components/UserPicker";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { usePageInRange } from "metabase/common/hooks/use-page-in-range";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { usePageTitle } from "metabase/hooks/use-page-title";
import {
  SIDEBAR_WIDTH,
  useDetailSidebarRouting,
} from "metabase/monitor/components/DetailSidebar";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { getTabChange } from "metabase/monitor/tab-change";
import { getTimePresetCutoff } from "metabase/monitor/time-presets";
import { useLocation, useParams } from "metabase/router";
import { Button, Flex, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useLazyListOAuthClientsQuery } from "metabase-enterprise/api";
import type {
  OAuthClient,
  RevokeOAuthClientsRequest,
} from "metabase-types/api";

import {
  OAuthClientDetailSidebar,
  useShownClient,
} from "../OAuthClientDetailSidebar";
import { OAuthClientsFilters } from "../OAuthClientsFilters";
import { OAuthClientsTable } from "../OAuthClientsTable";
import { OAuthClientsTabs } from "../OAuthClientsTabs";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  PAGE_SIZE,
  TAB_SORT_COLUMNS,
  TAB_SORT_CONFIG,
} from "./constants";
import type { RouteParams } from "./types";
import { useClientRevocation } from "./use-client-revocation";
import {
  buildListParams,
  isOAuthClientRevokedBy,
  urlStateConfig,
} from "./utils";

const getClientId = (client: OAuthClient) => client.client_id;

export const OAuthClientsPage = () => {
  usePageTitle(t`OAuth clients`);

  const location = useLocation();
  const { clientId } = useParams<RouteParams>();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const clearSelection = useCallback(() => setRowSelection({}), []);

  const cutoffs = useMemo(
    () => ({
      registeredAfter: getTimePresetCutoff(urlState.registered),
      lastUsedAfter: getTimePresetCutoff(urlState.last_used),
    }),
    [urlState.registered, urlState.last_used],
  );

  const { data, isLoading, isFetching, error } = useAbortableQuery(
    useLazyListOAuthClientsQuery,
    buildListParams(urlState, PAGE_SIZE, cutoffs),
  );
  const clients = data?.data;
  const total = data?.total ?? 0;
  const isRevokedTab = urlState.tab === "revoked";
  const selectedClients = useMemo(
    () => clients?.filter((client) => rowSelection[client.client_id]) ?? [],
    [clients, rowSelection],
  );
  const selectedCount = selectedClients.length;

  const goToPage = useCallback(
    (page: number) => patchUrlState({ page }, { immediate: true }),
    [patchUrlState],
  );

  // A revoke can empty a later page
  usePageInRange({
    page: urlState.page,
    pageSize: PAGE_SIZE,
    total: isFetching || error !== undefined ? undefined : data?.total,
    onPageChange: goToPage,
  });

  // The URL carries the filtered user as an id; the picker shows a name, so the one user it names is fetched
  const { data: filteredUser } = useGetUserQuery(urlState.user ?? skipToken);
  const selectedUser: UserOption | null = useMemo(
    () =>
      filteredUser === undefined || filteredUser.id !== urlState.user
        ? null
        : { id: filteredUser.id, label: filteredUser.common_name },
    [filteredUser, urlState.user],
  );

  useEffect(() => {
    clearSelection();
  }, [
    clearSelection,
    urlState.page,
    urlState.query,
    urlState.tab,
    urlState.registered,
    urlState.user,
    urlState.last_used,
    urlState.sort_column,
    urlState.sort_direction,
  ]);

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
      const column = TAB_SORT_COLUMNS[urlState.tab].find(
        (value) => value === first.id,
      );
      if (column === undefined) {
        return;
      }
      patchUrlState({
        sort_column: column,
        sort_direction: first.desc ? "desc" : "asc",
        page: 0,
      });
    },
    [patchUrlState, urlState.tab],
  );

  const handleSearchChange = useCallback(
    (query: string) => patchUrlState({ query, page: 0 }),
    [patchUrlState],
  );

  const {
    navigateToItem: navigateToClient,
    closeSidebar,
    prevId: prevClientId,
    nextId: nextClientId,
    selectedItem: clientFromPage,
  } = useDetailSidebarRouting({
    items: clients,
    getItemId: getClientId,
    selectedId: clientId,
    listPath: Urls.monitorOAuthClients(),
    getDetailPath: Urls.monitorOAuthClientDetail,
  });

  const { client: shownClient } = useShownClient(clientId, clientFromPage);

  const handleRevoked = useCallback(
    (request: RevokeOAuthClientsRequest) => {
      clearSelection();
      const isShownClientGone =
        shownClient === undefined ||
        isOAuthClientRevokedBy(shownClient, request);
      if (clientId !== undefined && isShownClientGone) {
        navigateToClient(undefined);
      }
    },
    [clearSelection, navigateToClient, shownClient, clientId],
  );

  const { isRevoking, confirmModal, revokeSelected, revokeAll, revokeClient } =
    useClientRevocation({ onRevoked: handleRevoked });

  return (
    <>
      <Flex ref={containerRef} h="100%" wrap="nowrap">
        <MonitorMain>
          <MonitorHeaderTitle mb="sm">{t`OAuth clients`}</MonitorHeaderTitle>

          <OAuthClientsTabs
            tab={urlState.tab}
            onChange={(tab) =>
              patchUrlState(getTabChange(urlState, tab, TAB_SORT_CONFIG))
            }
          />

          {isRevokedTab && (
            <Text size="sm" c="text-secondary">
              {t`Revoked clients are kept on record.`}
            </Text>
          )}

          <Flex gap="md" align="center">
            <DebouncedSearchInput
              value={urlState.query}
              placeholder={t`Search by name, client ID or redirect URI…`}
              aria-label={t`Search OAuth clients`}
              onChange={handleSearchChange}
            />
            <OAuthClientsFilters
              state={urlState}
              selectedUser={selectedUser}
              onChange={patchUrlState}
            />
            {!isRevokedTab && (
              <Button disabled={isRevoking} onClick={revokeAll} size="lg">
                {t`Revoke all clients`}
              </Button>
            )}
          </Flex>

          <OAuthClientsTable
            clients={clients}
            error={error}
            isFetching={isFetching}
            isRevokedTab={isRevokedTab}
            page={urlState.page}
            rowSelection={rowSelection}
            sorting={sorting}
            emptyLabel={
              isRevokedTab
                ? t`Clients you revoke will appear here.`
                : t`No active clients`
            }
            onSortingChange={handleSortingChange}
            onRowSelectionChange={setRowSelection}
            onRowClick={navigateToClient}
            selectedClientId={clientId}
          />

          {!isLoading && error === undefined && (
            <Flex justify="end">
              <PaginationControls
                page={urlState.page}
                pageSize={PAGE_SIZE}
                itemsLength={clients?.length ?? 0}
                total={total}
                showTotal
                onPreviousPage={() =>
                  patchUrlState(
                    { page: urlState.page - 1 },
                    { immediate: true },
                  )
                }
                onNextPage={() =>
                  patchUrlState(
                    { page: urlState.page + 1 },
                    { immediate: true },
                  )
                }
              />
            </Flex>
          )}
        </MonitorMain>

        {clientId !== undefined && (
          <Sidebar containerWidth={containerWidth} defaultWidth={SIDEBAR_WIDTH}>
            <OAuthClientDetailSidebar
              clientId={clientId}
              clientFromPage={clientFromPage}
              prevClientId={prevClientId}
              nextClientId={nextClientId}
              isRevoking={isRevoking}
              onNavigate={navigateToClient}
              onRevokeClient={revokeClient}
              onClose={closeSidebar}
            />
          </Sidebar>
        )}
      </Flex>

      <BulkActionBar
        opened={selectedCount > 0}
        message={ngettext(
          msgid`${selectedCount} client selected`,
          `${selectedCount} clients selected`,
          selectedCount,
        )}
      >
        <BulkActionButton
          danger
          disabled={isRevoking}
          onClick={() => revokeSelected(selectedClients)}
        >
          {t`Revoke`}
        </BulkActionButton>
        <BulkActionButton onClick={clearSelection}>{t`Clear`}</BulkActionButton>
      </BulkActionBar>

      {confirmModal}
    </>
  );
};
