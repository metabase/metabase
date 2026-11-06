import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackSegmentCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteSegments } from "metabase/common/data-studio/selectors";
import { useSegmentGroups } from "metabase/metadata/segment-groups";
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
import type { Table } from "metabase-types/api";

import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import { ListEmptyItem, ListSection } from "../ListSection";
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
export function SegmentList({ table }: SegmentListProps) {
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
  const hasGroupProposals =
    matchingGroupProposals.length > 0 || kindCandidates.length > 0;
  const hasProposals = hasGroupProposals || matchingProposals.length > 0;
  const hasViewMatches =
    view === "system"
      ? systemSegments.length > 0
      : view === "custom"
        ? segmentGroups.length > 0 || customSegments.length > 0
        : hasProposals;
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
      {/* The view control belongs to the search, so it sits closer than the lists */}
      <Stack gap="md">
        <ListSearchBar
          value={query}
          placeholder={
            view === "custom"
              ? t`Search segments and groups`
              : t`Search segments`
          }
          onChange={setQuery}
        />
        <SegmentedControl<SegmentView>
          fullWidth
          data={getViewOptions()}
          value={view}
          onChange={setView}
        />
      </Stack>

      {isSearching && !hasViewMatches && (
        <ListSearchEmptyState>{t`No segments match "${query}"`}</ListSearchEmptyState>
      )}

      {view === "system" && systemSegments.length > 0 && (
        <ListSection>
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

      {view === "custom" && (!isSearching || segmentGroups.length > 0) && (
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

      {view === "custom" && (!isSearching || customSegments.length > 0) && (
        <ListSection
          title={t`Custom segments`}
          action={
            canCreateSegment && (
              <Button
                component={ForwardRefLink}
                to={Urls.newDataStudioDataModelSegment({
                  databaseId: table.db_id,
                  schemaName: table.schema,
                  tableId: table.id,
                })}
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
                href={getSegmentHref(segment.id)}
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

      {view === "proposed" && hasGroupProposals && (
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

      {view === "proposed" &&
        (!isSearching || matchingProposals.length > 0) && (
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
