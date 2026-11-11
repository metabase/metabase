import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackSegmentCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteSegments } from "metabase/common/data-studio/selectors";
import { useSegmentGroups } from "metabase/metadata/segment-groups";
import type { SystemSegmentRole } from "metabase/metadata/table-segments";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { useSelector } from "metabase/redux";
import { useNavigate, useSearchParams } from "metabase/router";
import { Button, Icon, Stack, Tabs, rem } from "metabase/ui";
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

/** Where the list's segments open; the Library and Connected data differ */
export type SegmentListUrls = {
  segment: (segmentId: SegmentId) => string;
  systemSegment: (role: SystemSegmentRole) => string;
  newSegment: string;
  segmentGroup: (groupId: string) => string;
  newSegmentGroup: string;
};

type SegmentListProps = {
  table: Table;
  /** Defaults to Connected data's segment pages */
  getUrls?: (table: Table) => SegmentListUrls;
  /** Off hides the search box; the lists then show everything */
  isSearchable?: boolean;
  /** A full page: 17px section subheadings, and more room between sections */
  isFullPage?: boolean;
};

function getDataModelSegmentUrls(table: Table): SegmentListUrls {
  const tableParams = {
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
  };
  return {
    segment: (segmentId) =>
      Urls.dataStudioDataModelSegment({ ...tableParams, segmentId }),
    systemSegment: (role) =>
      Urls.dataStudioDataModelSystemSegment({ ...tableParams, role }),
    newSegment: Urls.newDataStudioDataModelSegment(tableParams),
    segmentGroup: (groupId) =>
      Urls.dataStudioDataModelSegmentGroup({ ...tableParams, groupId }),
    newSegmentGroup: Urls.newDataStudioDataModelSegmentGroup(tableParams),
  };
}

type SegmentView = "custom" | "groups" | "system";

const getViewOptions = (): { value: SegmentView; label: string }[] => [
  { value: "custom", label: t`Segments` },
  { value: "groups", label: t`Groups` },
  { value: "system", label: t`System segments` },
];

/**
 * The table's segments, one view at a time: the ones people made, the groups
 * they form, what sync proposes, and the system segments every table has.
 */
export function SegmentList({
  table,
  getUrls,
  isSearchable = true,
  isFullPage = false,
}: SegmentListProps) {
  const [query, setQuery] = useState("");
  // Pages that return to the groups ask for them with `?view=groups`
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<SegmentView>(
    () =>
      getViewOptions().find(
        (option) => option.value === searchParams.get("view"),
      )?.value ?? "custom",
  );
  const navigate = useNavigate();
  const model = useTableSegmentsModel(table);
  const proposals = useCohortProposals(table);
  const { accept, dismiss } = useCohortProposalActions(table, model.baseQuery);
  const groupProposals = useSegmentGroupProposals(table);
  const groupProposalActions = useSegmentGroupProposalActions(
    table,
    model.baseQuery,
  );
  const { getSegmentGroups } = useSegmentGroups();
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
  const hasMatches =
    systemSegments.length > 0 ||
    segmentGroups.length > 0 ||
    customSegments.length > 0 ||
    matchingProposals.length > 0 ||
    matchingGroupProposals.length > 0;
  const showsView = (viewToShow: SegmentView) =>
    !isSearching && view === viewToShow;
  const urls = getUrls?.(table) ?? getDataModelSegmentUrls(table);
  const viewControl = (
    <Tabs
      value={view}
      onChange={(value) => {
        const next = getViewOptions().find((option) => option.value === value);
        if (next) {
          setView(next.value);
        }
      }}
    >
      <Tabs.List>
        {getViewOptions().map((option) => (
          <Tabs.Tab key={option.value} value={option.value}>
            {option.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );

  return (
    <Stack
      // A full page spaces its tabs and sections at twice the drawer's 24px
      gap={isFullPage ? rem(48) : "xl"}
      data-testid="table-segments-page"
    >
      {/* The view control belongs to the search, so it sits closer than the lists */}
      <Stack gap="md">
        {isSearchable && (
          <ListSearchBar
            value={query}
            placeholder={t`Search all segments and groups`}
            onChange={setQuery}
          />
        )}
        {!isSearching && viewControl}
      </Stack>

      {isSearching && !hasMatches && (
        <ListSearchEmptyState>{t`No segments match "${query}"`}</ListSearchEmptyState>
      )}

      {(showsView("system") || isSearching) && systemSegments.length > 0 && (
        <ListSection
          title={isSearching ? t`System segments` : undefined}
          isSubheading={isFullPage}
        >
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

      {(showsView("groups") || (isSearching && segmentGroups.length > 0)) && (
        <ListSection
          title={t`Segment groups`}
          isSubheading={isFullPage}
          action={
            canCreateSegment && (
              <Button
                component={ForwardRefLink}
                to={urls.newSegmentGroup}
                variant="filled"
                size="md"
                leftSection={<Icon name="add" />}
              >
                {t`New segment group`}
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
                    ? () => navigate(urls.segmentGroup(group.id))
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
          isSubheading={isFullPage}
          action={
            canCreateSegment && (
              <Button
                component={ForwardRefLink}
                to={urls.newSegment}
                variant="filled"
                size="md"
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

      {((showsView("groups") && hasGroupProposals) ||
        (isSearching && matchingGroupProposals.length > 0)) && (
        <ListSection
          title={t`Proposed segment groups`}
          isSubheading={isFullPage}
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

      {(showsView("custom") ||
        (isSearching && matchingProposals.length > 0)) && (
        <ListSection
          title={t`Proposed segments`}
          isSubheading={isFullPage}
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
    </Stack>
  );
}
