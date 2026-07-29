import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useSearchQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import CS from "metabase/css/core/index.css";
import {
  NodeListContainer,
  NodeListItemIcon,
  NodeListItemLink,
  NodeListTitle,
  NodeListTitleText,
} from "metabase/querying/components/DataReference/NodeList";
import type {
  DataReferenceLibraryItem,
  DataReferencePaneProps,
  OnItemClick,
} from "metabase/querying/components/DataReference/types";
import { Box, Ellipsified, Text } from "metabase/ui";
import { type SearchResult, isConcreteTableId } from "metabase-types/api";

import { useGetLibraryCollection } from "./utils";

type DataReferenceLibraryPaneProps =
  DataReferencePaneProps<DataReferenceLibraryItem>;

const byName = (a: SearchResult, b: SearchResult) =>
  a.name.localeCompare(b.name);

export const DataReferenceLibraryPane = ({
  onBack,
  onClose,
  onItemClick,
  queryDatabaseId,
}: DataReferenceLibraryPaneProps) => {
  const {
    data: libraryCollection,
    isLoading: isLoadingCollection,
    error: libraryCollectionError,
  } = useGetLibraryCollection();

  const {
    data: searchResponse,
    isLoading: isLoadingSearch,
    error: searchError,
  } = useSearchQuery(
    libraryCollection
      ? {
          collection: libraryCollection.id,
          models: ["table"],
          context: "library",
        }
      : skipToken,
  );

  const isLoading = isLoadingCollection || isLoadingSearch;
  const error = libraryCollectionError || searchError;

  const { targetTables, otherTables } = useMemo(() => {
    const tables = (searchResponse?.data ?? []).filter(
      (result) => result.model === "table",
    );
    const targetTables = tables
      .filter((table) => table.database_id === queryDatabaseId)
      .sort(byName);
    const otherTables = tables
      .filter((table) => table.database_id !== queryDatabaseId)
      .sort(byName);
    return { targetTables, otherTables };
  }, [searchResponse, queryDatabaseId]);

  const hasTables = targetTables.length > 0 || otherTables.length > 0;
  const hasTarget = queryDatabaseId != null;

  return (
    <LoadingAndErrorWrapper
      loading={isLoading}
      error={error}
      className={CS.fullHeight}
    >
      <SidebarContent
        title={t`Library`}
        icon="repository"
        onBack={onBack}
        onClose={onClose}
      >
        <SidebarContent.Pane>
          {hasTables ? (
            <NodeListContainer>
              {hasTarget && (
                <LibraryTableList
                  title={t`In this database`}
                  tables={targetTables}
                  onItemClick={onItemClick}
                  emptyMessage={t`No tables`}
                  data-testid="library-tables-current-database"
                />
              )}
              {otherTables.length > 0 && (
                <LibraryTableList
                  title={hasTarget ? t`In other databases` : t`Tables`}
                  tables={otherTables}
                  onItemClick={onItemClick}
                  showDatabaseName={hasTarget}
                  mt={hasTarget ? 16 : undefined}
                  data-testid={
                    hasTarget
                      ? "library-tables-other-databases"
                      : "library-tables"
                  }
                />
              )}
            </NodeListContainer>
          ) : (
            <Box ta="center" py="lg" px="md">
              <Text c="text-secondary">
                {t`No published tables in your library yet.`}
              </Text>
            </Box>
          )}
        </SidebarContent.Pane>
      </SidebarContent>
    </LoadingAndErrorWrapper>
  );
};

type LibraryTableListProps = {
  title: string;
  tables: SearchResult[];
  onItemClick: OnItemClick;
  showDatabaseName?: boolean;
  emptyMessage?: string;
  mt?: number;
  "data-testid"?: string;
};

const LibraryTableList = ({
  title,
  tables,
  onItemClick,
  showDatabaseName,
  emptyMessage,
  mt,
  "data-testid": dataTestId,
}: LibraryTableListProps) => {
  if (tables.length === 0 && !emptyMessage) {
    return null;
  }

  return (
    <li data-testid={dataTestId}>
      <NodeListTitle mt={mt}>
        <NodeListTitleText ml={undefined}>{title}</NodeListTitleText>
      </NodeListTitle>
      {tables.length > 0 ? (
        <ul>
          {tables.map((table) => {
            const isSyncing = table.initial_sync_status !== "complete";
            return (
              <li key={table.id}>
                <NodeListItemLink
                  disabled={isSyncing}
                  onClick={() => {
                    if (isConcreteTableId(table.id)) {
                      onItemClick({ type: "table", id: table.id });
                    }
                  }}
                >
                  <NodeListItemIcon
                    disabled={isSyncing}
                    name="table"
                    style={{ flexShrink: 0 }}
                  />
                  <Ellipsified fw={700} ml="sm">
                    {table.name}
                  </Ellipsified>
                  {showDatabaseName && table.database_name && (
                    <Ellipsified
                      c="text-secondary"
                      fw="normal"
                      fz="sm"
                      ml="sm"
                      flex={"1 0 30%"}
                    >
                      {table.database_name}
                    </Ellipsified>
                  )}
                </NodeListItemLink>
              </li>
            );
          })}
        </ul>
      ) : (
        <Text c="text-secondary" px="sm" pb="sm">
          {emptyMessage}
        </Text>
      )}
    </li>
  );
};
