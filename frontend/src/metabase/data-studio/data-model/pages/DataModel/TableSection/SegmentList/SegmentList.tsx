import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackSegmentCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteSegments } from "metabase/common/data-studio/selectors";
import { useSelector } from "metabase/redux";
import { Button, Icon, Stack, Text, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import { useTableSegmentsModel } from "../table-segments";

import {
  CohortProposalItem,
  useCohortProposalActions,
  useCohortProposals,
} from "./CohortProposals";
import { SegmentItem } from "./SegmentItem";
import { SystemSegmentItem } from "./SystemSegmentItem";

type SegmentListProps = {
  table: Table;
};

/**
 * The table's segments in three groups: the system segments every table has,
 * the ones people made, and cohorts sync proposes.
 */
export function SegmentList({ table }: SegmentListProps) {
  const [query, setQuery] = useState("");
  const model = useTableSegmentsModel(table);
  const proposals = useCohortProposals(table);
  const { accept, dismiss } = useCohortProposalActions(table, model.baseQuery);
  const canCreateSegment = useSelector((state) =>
    getUserCanWriteSegments(state, table.is_published),
  );
  const defaultSegment = model.defaultSegment.segment;
  const isSearching = query.trim() !== "";

  const systemSegments = model.systemSegments.filter((segment) =>
    matchesListSearch(query, segment.label, ...segment.filterNames),
  );
  const customSegments = (table.segments ?? []).filter((segment) =>
    matchesListSearch(query, segment.name),
  );
  const matchingProposals = proposals.filter((proposal) =>
    matchesListSearch(query, proposal.name),
  );
  const hasMatches =
    systemSegments.length > 0 ||
    customSegments.length > 0 ||
    matchingProposals.length > 0;

  const getSegmentHref = (segmentId: number) =>
    Urls.dataStudioDataModelSegment({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      segmentId,
    });

  return (
    <Stack gap="xl" data-testid="table-segments-page">
      <ListSearchBar
        value={query}
        placeholder={t`Search segments`}
        onChange={setQuery}
      >
        {canCreateSegment && (
          <Button
            component={ForwardRefLink}
            to={Urls.newDataStudioDataModelSegment({
              databaseId: table.db_id,
              schemaName: table.schema,
              tableId: table.id,
            })}
            leftSection={<Icon name="add" />}
            onClick={() =>
              trackSegmentCreateStarted(
                "data_studio_segments",
                Number(table.id),
              )
            }
          >{t`New segment`}</Button>
        )}
      </ListSearchBar>

      {isSearching && !hasMatches && (
        <ListSearchEmptyState>{t`No segments match "${query}"`}</ListSearchEmptyState>
      )}

      {systemSegments.length > 0 && (
        <SegmentGroup title={t`System segments`}>
          {systemSegments.map((segment) => (
            <SystemSegmentItem
              key={segment.role}
              segment={segment}
              href={Urls.dataStudioDataModelSystemSegment({
                databaseId: table.db_id,
                schemaName: table.schema,
                tableId: table.id,
                role: segment.role,
              })}
              isDefault={
                defaultSegment.type === "system" &&
                defaultSegment.role === segment.role
              }
            />
          ))}
        </SegmentGroup>
      )}

      {(!isSearching || customSegments.length > 0) && (
        <SegmentGroup title={t`Custom segments`}>
          {customSegments.length > 0 ? (
            customSegments.map((segment) => (
              <SegmentItem
                key={segment.id}
                segment={segment}
                href={getSegmentHref(segment.id)}
                isDefault={
                  defaultSegment.type === "custom" &&
                  defaultSegment.segmentId === segment.id
                }
              />
            ))
          ) : (
            <Text c="text-secondary">{t`No custom segments yet.`}</Text>
          )}
        </SegmentGroup>
      )}

      {matchingProposals.length > 0 && (
        <SegmentGroup
          title={t`Proposed cohorts`}
          description={t`Groups to compare, from status values and milestones. Accept one to make it a segment.`}
        >
          {matchingProposals.map((proposal) => (
            <CohortProposalItem
              key={proposal.key}
              proposal={proposal}
              baseQuery={model.baseQuery}
              canAccept={canCreateSegment}
              onAccept={() => accept(proposal)}
              onDismiss={() => dismiss(proposal)}
            />
          ))}
        </SegmentGroup>
      )}
    </Stack>
  );
}

function SegmentGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="sm">
      <Stack gap={0}>
        <Text fw="bold">{title}</Text>
        {description && (
          <Text size="sm" c="text-secondary">
            {description}
          </Text>
        )}
      </Stack>
      <Stack gap={rem(12)} role="list">
        {children}
      </Stack>
    </Stack>
  );
}
