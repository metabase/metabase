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
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { getTimePresetCutoff } from "metabase/monitor/time-presets";
import { useLocation } from "metabase/router";
import { Button, Flex, Text } from "metabase/ui";
import { useLazyListOAuthClientsQuery } from "metabase-enterprise/api";
import { OAUTH_CLIENT_SORT_COLUMNS } from "metabase-types/api";

import { OAuthClientsFilters } from "../OAuthClientsFilters";
import { OAuthClientsTable } from "../OAuthClientsTable";
import { OAuthClientsTabs } from "../OAuthClientsTabs";

import {
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  PAGE_SIZE,
} from "./constants";
import { useClientRevocation } from "./use-client-revocation";
import { buildListParams, urlStateConfig } from "./utils";

export const OAuthClientsPage = () => {
  usePageTitle(t`OAuth clients`);

  const location = useLocation();
  const [urlState, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const clearSelection = useCallback(() => setRowSelection({}), []);

  const registeredAfter = useMemo(
    () => getTimePresetCutoff(urlState.registered),
    [urlState.registered],
  );

  const { data, isLoading, isFetching, error } = useAbortableQuery(
    useLazyListOAuthClientsQuery,
    buildListParams(urlState, PAGE_SIZE, registeredAfter),
  );
  const clients = useMemo(() => data?.data ?? [], [data?.data]);
  const total = data?.total ?? 0;
  const isRevokedTab = urlState.tab === "revoked";
  const selectedClients = useMemo(
    () => clients.filter((client) => rowSelection[client.client_id]),
    [clients, rowSelection],
  );
  const selectedCount = selectedClients.length;

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
      const column = OAUTH_CLIENT_SORT_COLUMNS.find(
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
    [patchUrlState],
  );

  const handleSearchChange = useCallback(
    (query: string) => patchUrlState({ query, page: 0 }),
    [patchUrlState],
  );

  const { isRevoking, confirmModal, revokeSelected, revokeAll } =
    useClientRevocation({ onRevoked: clearSelection });

  return (
    <>
      <MonitorMain>
        <MonitorHeaderTitle mb="sm">{t`OAuth clients`}</MonitorHeaderTitle>

        <OAuthClientsTabs
          tab={urlState.tab}
          onChange={(patch) => patchUrlState({ ...patch, page: 0 })}
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
            // Not disabled on an empty list: the action ignores the filters, so its enablement must not depend on
            // them either, or a search matching nothing would disable a button that would revoke hundreds
            <Button disabled={isRevoking} onClick={revokeAll}>
              {t`Revoke all clients`}
            </Button>
          )}
        </Flex>

        <OAuthClientsTable
          clients={clients}
          error={error}
          isFetching={isFetching}
          isLoading={isLoading}
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
        />

        {!isLoading && error === undefined && (
          <Flex justify="end">
            <PaginationControls
              page={urlState.page}
              pageSize={PAGE_SIZE}
              itemsLength={clients.length}
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
