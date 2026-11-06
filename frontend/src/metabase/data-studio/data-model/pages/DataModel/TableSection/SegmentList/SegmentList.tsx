import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackSegmentCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteSegments } from "metabase/common/data-studio/selectors";
import { useSegmentGroups } from "metabase/metadata/segment-groups";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { useSelector } from "metabase/redux";
import { Button, Icon, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import { ListSection } from "../ListSection";
import { useTableSegmentsModel } from "../table-segments";

import {
  CohortProposalItem,
  useCohortProposalActions,
  useCohortProposals,
} from "./CohortProposals";
import { SegmentGroupModal } from "./SegmentGroupModal";
import {
  KindPartitionProposalItem,
  SegmentGroupItem,
  SegmentGroupProposalItem,
  getMemberLabels,
  useSegmentGroupProposalActions,
  useSegmentGroupProposals,
} from "./SegmentGroups";
import { SegmentItem } from "./SegmentItem";
import { SystemSegmentItem } from "./SystemSegmentItem";

type SegmentListProps = {
  table: Table;
};

/**
 * The table's segments in groups: the system segments every table has,
 * segment groups, the ones people made, and cohorts sync proposes.
 */
export function SegmentList({ table }: SegmentListProps) {
  const [query, setQuery] = useState("");
  // `null` is a new group; `undefined` means the editor is closed
  const [editingGroupId, setEditingGroupId] = useState<string | null>();
  const model = useTableSegmentsModel(table);
  const proposals = useCohortProposals(table);
  const { accept, dismiss } = useCohortProposalActions(table, model.baseQuery);
  const groupProposals = useSegmentGroupProposals(table);
  const groupProposalActions = useSegmentGroupProposalActions(
    table,
    model.baseQuery,
  );
  const { getSegmentGroups, saveSegmentGroup, deleteSegmentGroup } =
    useSegmentGroups();
  const canCreateSegment = useSelector((state) =>
    getUserCanWriteSegments(state, table.is_published),
  );
  const defaultSegment = model.defaultSegment.segment;
  const isSearching = query.trim() !== "";
  const tableSegments = table.segments ?? [];

  const systemSegments = model.systemSegments.filter((segment) =>
    matchesListSearch(query, segment.label, ...segment.filterNames),
  );
  const segmentGroups = getSegmentGroups(table).filter((group) =>
    matchesListSearch(
      query,
      group.name,
      ...getMemberLabels(group, tableSegments),
    ),
  );
  const customSegments = tableSegments.filter((segment) =>
    matchesListSearch(query, segment.name),
  );
  const matchingProposals = proposals.filter((proposal) =>
    matchesListSearch(query, proposal.name),
  );
  const matchingGroupProposals = groupProposals.proposals.filter((proposal) =>
    matchesListSearch(query, proposal.name),
  );
  // Kind proposals filter themselves once their values load
  const kindCandidates = groupProposals.kindCandidates;
  const hasProposals =
    matchingProposals.length > 0 ||
    matchingGroupProposals.length > 0 ||
    kindCandidates.length > 0;
  const hasMatches =
    systemSegments.length > 0 ||
    segmentGroups.length > 0 ||
    customSegments.length > 0 ||
    hasProposals;
  const editingGroup =
    editingGroupId != null
      ? getSegmentGroups(table).find(({ id }) => id === editingGroupId)
      : undefined;

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
        <ListSection title={t`System segments`}>
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
        </ListSection>
      )}

      {(!isSearching || segmentGroups.length > 0) && (
        <ListSection
          title={t`Segment groups`}
          description={t`Named sets of segments. When they don't overlap, they split rows into groups to compare.`}
          action={
            canCreateSegment && (
              <Button
                size="compact-sm"
                variant="subtle"
                leftSection={<Icon name="add" />}
                onClick={() => setEditingGroupId(null)}
              >
                {t`New group`}
              </Button>
            )
          }
        >
          {segmentGroups.length > 0 ? (
            segmentGroups.map((group) => (
              <SegmentGroupItem
                key={group.id}
                group={group}
                table={table}
                onOpen={
                  canCreateSegment
                    ? () => setEditingGroupId(group.id)
                    : undefined
                }
              />
            ))
          ) : (
            <Text c="text-secondary">{t`No segment groups yet.`}</Text>
          )}
        </ListSection>
      )}

      {(!isSearching || customSegments.length > 0) && (
        <ListSection title={t`Custom segments`}>
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
        </ListSection>
      )}

      {hasProposals && (
        <ListSection
          title={t`Proposed cohorts`}
          description={t`Groups to compare, from statuses, flags, values, and milestones. Accept one to make its segments.`}
        >
          {matchingGroupProposals.map((proposal) => (
            <SegmentGroupProposalItem
              key={proposal.key}
              proposal={proposal}
              canAccept={canCreateSegment}
              onAccept={() => groupProposalActions.accept(proposal)}
              onDismiss={() => groupProposalActions.dismiss(proposal)}
            />
          ))}
          {kindCandidates.map((field) => (
            <KindPartitionProposalItem
              key={getRawTableFieldId(field)}
              field={field}
              query={query}
              canAccept={canCreateSegment}
              onAccept={groupProposalActions.accept}
              onDismiss={groupProposalActions.dismiss}
            />
          ))}
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
        </ListSection>
      )}

      {editingGroupId !== undefined && (
        <SegmentGroupModal
          // Fresh state per group
          key={editingGroupId ?? "new"}
          group={editingGroup}
          segments={tableSegments}
          onSave={(group) => {
            saveSegmentGroup(table, group);
            setEditingGroupId(undefined);
          }}
          onDelete={(groupId) => {
            deleteSegmentGroup(table, groupId);
            setEditingGroupId(undefined);
          }}
          onClose={() => setEditingGroupId(undefined)}
        />
      )}
    </Stack>
  );
}
