import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackSegmentCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteSegments } from "metabase/common/data-studio/selectors";
import { useSegmentGroups } from "metabase/metadata/segment-groups";
import type { SystemSegmentRole } from "metabase/metadata/table-segments";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { useSelector } from "metabase/redux";
import {
  Button,
  Icon,
  SegmentedControl,
  type SegmentedControlItem,
  Stack,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Segment, SegmentId, Table } from "metabase-types/api";

import { getQueryClauses } from "../ClausePills";
import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import { ListEmptyItem, ListSection } from "../ListSection";
import { useTableQuery, useTableSegmentsModel } from "../table-segments";

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
  SuggestedValueGroupingProposalItem,
  getMemberLabels,
  useSegmentGroupProposalActions,
  useSegmentGroupProposals,
} from "./SegmentGroups";
import { SegmentItem } from "./SegmentItem";
import { SystemSegmentItem } from "./SystemSegmentItem";

export type SegmentListUrls = {
  segment: (segmentId: SegmentId) => string;
  newSegment: string;
  systemSegment: (role: SystemSegmentRole) => string;
};

type SegmentListProps = {
  table: Table;
  urls?: SegmentListUrls;
};

function getDataModelSegmentUrls(table: Table): SegmentListUrls {
  const tablePath = {
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
  };
  return {
    segment: (segmentId) =>
      Urls.dataStudioDataModelSegment({ ...tablePath, segmentId }),
    newSegment: Urls.newDataStudioDataModelSegment(tablePath),
    systemSegment: (role) =>
      Urls.dataStudioDataModelSystemSegment({ ...tablePath, role }),
  };
}

type SegmentView = "system" | "custom" | "proposed";

const getViewOptions = (): SegmentedControlItem<SegmentView>[] => [
  { value: "custom", label: t`Custom` },
  { value: "system", label: t`System` },
  { value: "proposed", label: t`Proposed` },
];

/**
 * The table's segments, one view at a time: the system segments every table
 * has, the ones people made with the groups they form, and what sync proposes.
 */
export function SegmentList({
  table,
  urls = getDataModelSegmentUrls(table),
}: SegmentListProps) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<SegmentView>("custom");
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
  const { fromDefinition } = useTableQuery(table);
  // Each clause of a segment's definition, for its card's pills
  const getSegmentClauses = (segment: Segment) => {
    try {
      return getQueryClauses(fromDefinition(segment.definition));
    } catch {
      // A definition the query library can't read keeps its server description
      return undefined;
    }
  };

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
  const { kindCandidates, suggestedCandidates } = groupProposals;
  const hasGroupProposals =
    matchingGroupProposals.length > 0 ||
    kindCandidates.length > 0 ||
    suggestedCandidates.length > 0;
  const matchingProposalCount =
    matchingGroupProposals.length + matchingProposals.length;
  const hasMatches =
    systemSegments.length > 0 ||
    segmentGroups.length > 0 ||
    customSegments.length > 0 ||
    matchingProposalCount > 0;
  const showsView = (viewToShow: SegmentView) =>
    !isSearching && view === viewToShow;
  const editingGroup =
    editingGroupId != null
      ? getSegmentGroups(table).find(({ id }) => id === editingGroupId)
      : undefined;

  return (
    <Stack gap="xl" data-testid="table-segments-page">
      {/* The view control belongs to the search, so it sits closer than the lists */}
      <Stack gap="md">
        <ListSearchBar
          value={query}
          placeholder={t`Search all segments and groups`}
          onChange={setQuery}
        />
        {!isSearching && (
          <SegmentedControl<SegmentView>
            fullWidth
            data={getViewOptions()}
            value={view}
            onChange={setView}
          />
        )}
      </Stack>

      {isSearching && !hasMatches && (
        <ListSearchEmptyState>{t`No segments match "${query}"`}</ListSearchEmptyState>
      )}

      {(showsView("system") || isSearching) && systemSegments.length > 0 && (
        <ListSection title={isSearching ? t`System segments` : undefined}>
          {systemSegments.map((segment) => (
            <SystemSegmentItem
              key={segment.role}
              segment={segment}
              href={urls.systemSegment(segment.role)}
              isDefault={
                defaultSegment.type === "system" &&
                defaultSegment.role === segment.role
              }
              onConfirm={
                canCreateSegment
                  ? () => model.confirmSystemSegment(segment.role)
                  : undefined
              }
            />
          ))}
        </ListSection>
      )}

      {(showsView("custom") || (isSearching && segmentGroups.length > 0)) && (
        <ListSection
          title={t`Segment groups`}
          description={t`Named sets of custom segments. When they don't overlap, they split rows into groups to compare.`}
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
            <ListEmptyItem>{t`No segment groups yet`}</ListEmptyItem>
          )}
        </ListSection>
      )}

      {(showsView("custom") || (isSearching && customSegments.length > 0)) && (
        <ListSection
          title={t`Custom segments`}
          action={
            canCreateSegment && (
              <Button
                component={ForwardRefLink}
                to={urls.newSegment}
                size="compact-sm"
                variant="subtle"
                leftSection={<Icon name="add" />}
                onClick={() =>
                  trackSegmentCreateStarted(
                    "data_studio_segments",
                    Number(table.id),
                  )
                }
              >
                {t`New segment`}
              </Button>
            )
          }
        >
          {customSegments.length > 0 ? (
            customSegments.map((segment) => (
              <SegmentItem
                key={segment.id}
                segment={segment}
                href={urls.segment(segment.id)}
                clauses={getSegmentClauses(segment)}
                isDefault={
                  defaultSegment.type === "custom" &&
                  defaultSegment.segmentId === segment.id
                }
              />
            ))
          ) : (
            <ListEmptyItem>{t`No custom segments yet`}</ListEmptyItem>
          )}
        </ListSection>
      )}

      {((showsView("proposed") && hasGroupProposals) ||
        (isSearching && matchingGroupProposals.length > 0)) && (
        <ListSection
          title={t`Proposed segment groups`}
          description={t`Partitions from statuses, flags, and values. Accepting one makes a segment for each of its groups, and the group itself.`}
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
          {suggestedCandidates.map((candidate) => (
            <SuggestedValueGroupingProposalItem
              key={`${candidate.rule.key}:${getRawTableFieldId(candidate.field)}`}
              candidate={candidate}
              query={query}
              canAccept={canCreateSegment}
              onAccept={groupProposalActions.accept}
              onDismiss={groupProposalActions.dismiss}
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
        </ListSection>
      )}

      {(showsView("proposed") ||
        (isSearching && matchingProposals.length > 0)) && (
        <ListSection
          title={t`Proposed segments`}
          description={t`Rows that reached a milestone, like Activated or Converted, based on date or yes/no columns. Accepting one makes it a custom segment.`}
        >
          {matchingProposals.length > 0 ? (
            matchingProposals.map((proposal) => (
              <CohortProposalItem
                key={proposal.key}
                proposal={proposal}
                baseQuery={model.baseQuery}
                canAccept={canCreateSegment}
                onAccept={() => accept(proposal)}
                onDismiss={() => dismiss(proposal)}
              />
            ))
          ) : (
            <ListEmptyItem>{t`No proposed segments`}</ListEmptyItem>
          )}
        </ListSection>
      )}

      {editingGroupId !== undefined && (
        <SegmentGroupModal
          // Fresh state per group
          key={editingGroupId ?? "new"}
          group={editingGroup}
          segments={tableSegments}
          systemSegments={model.systemSegments}
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
