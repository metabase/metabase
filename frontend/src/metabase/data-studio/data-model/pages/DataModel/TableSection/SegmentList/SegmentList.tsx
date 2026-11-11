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
import { Box, Button, Icon, Stack, Tabs, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Segment, SegmentId, Table } from "metabase-types/api";

import { getQueryClauses } from "../ClausePills";
import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import { ListEmptyItem, type ListLayout, ListSection } from "../ListSection";
import { TableDefaultSegment } from "../TableFiltering";
import {
  isDefaultSegment,
  useTableQuery,
  useTableSegmentsModel,
} from "../table-segments";

import {
  CohortProposalItem,
  useCohortProposalActions,
  useCohortProposals,
} from "./CohortProposals";
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
  /** Shows the table's default segment setting above its segments */
  hasDefaultSegmentSetting?: boolean;
  /** Tabs for segments and groups, or one page of sections with proposals inline */
  layout?: ListLayout;
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

type SegmentView = "custom" | "groups";

const getViewOptions = (): { value: SegmentView; label: string }[] => [
  { value: "custom", label: t`Segments` },
  { value: "groups", label: t`Groups` },
];

/**
 * The table's segments, one view at a time: the ones people made with the
 * system segments every table has, and the groups they form, each with what
 * sync proposes.
 */
export function SegmentList({
  table,
  getUrls,
  isSearchable = true,
  isFullPage = false,
  hasDefaultSegmentSetting = false,
  layout = "tabs",
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
  const kindCandidates = groupProposals.kindCandidates;
  const hasGroupProposals =
    matchingGroupProposals.length > 0 || kindCandidates.length > 0;
  const hasViewMatches =
    view === "groups"
      ? segmentGroups.length > 0 || hasGroupProposals
      : customSegments.length > 0 ||
        systemSegments.length > 0 ||
        matchingProposals.length > 0;
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

  const newSegmentButton = canCreateSegment && (
    <Button
      component={ForwardRefLink}
      to={urls.newSegment}
      variant="filled"
      size="md"
      leftSection={<Icon name="add" />}
      onClick={() =>
        trackSegmentCreateStarted("data_studio_segments", Number(table.id))
      }
    >
      {t`New segment`}
    </Button>
  );
  const newSegmentGroupButton = canCreateSegment && (
    <Button
      component={ForwardRefLink}
      to={urls.newSegmentGroup}
      variant="filled"
      size="md"
      leftSection={<Icon name="add" />}
    >
      {t`New group`}
    </Button>
  );

  const segmentItems = [
    ...systemSegments.map((segment) => (
      <SystemSegmentItem
        key={segment.role}
        segment={segment}
        href={urls.systemSegment(segment.role)}
        isDefault={isDefaultSegment(model.defaultSegment, {
          type: "system",
          role: segment.role,
        })}
      />
    )),
    ...customSegments.map((segment) => (
      <SegmentItem
        key={segment.id}
        segment={segment}
        href={urls.segment(segment.id)}
        clauses={getSegmentClauses(segment)}
        isDefault={isDefaultSegment(model.defaultSegment, {
          type: "custom",
          segmentId: segment.id,
        })}
      />
    )),
  ];
  const getProposedSegmentItems = (isMuted: boolean) =>
    matchingProposals.map((proposal) => (
      <CohortProposalItem
        key={proposal.key}
        proposal={proposal}
        baseQuery={model.baseQuery}
        canAccept={canCreateSegment}
        isMuted={isMuted}
        onAccept={() => accept(proposal)}
        onDismiss={() => dismiss(proposal)}
      />
    ));
  const groupItems = segmentGroups.map((group) => (
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
  ));
  const getProposedGroupItems = (isMuted: boolean) => [
    ...matchingGroupProposals.map((proposal) => (
      <SegmentGroupProposalItem
        key={proposal.key}
        proposal={proposal}
        canAccept={canCreateSegment}
        isMuted={isMuted}
        onAccept={() => groupProposalActions.accept(proposal)}
        onDismiss={() => groupProposalActions.dismiss(proposal)}
      />
    )),
    ...kindCandidates.map((field) => (
      <KindPartitionProposalItem
        key={getRawTableFieldId(field)}
        field={field}
        query={query}
        canAccept={canCreateSegment}
        isMuted={isMuted}
        onAccept={groupProposalActions.accept}
        onDismiss={groupProposalActions.dismiss}
      />
    )),
  ];
  const segmentGroupsDescription = t`Named sets of segments, like Open, Won and Lost deals. When the segments don't overlap, people can group by, filter on and compare them side by side.`;
  const defaultSegmentSetting = hasDefaultSegmentSetting && (
    <TableDefaultSegment table={table} readOnly={!table.can_write} />
  );

  if (layout === "sections") {
    // One page: segments, then groups, each with its proposals mixed in
    const proposedSegmentItems = getProposedSegmentItems(true);
    const proposedGroupItems = getProposedGroupItems(true);
    return (
      <Stack
        gap={isFullPage ? rem(48) : "xl"}
        data-testid="table-segments-page"
      >
        {isSearchable && (
          <ListSearchBar
            value={query}
            placeholder={t`Search segments and groups`}
            onChange={setQuery}
          />
        )}
        {defaultSegmentSetting && (
          // The page's 24px top padding plus this match the 48px gap below
          <Box pt={isFullPage ? "xl" : 0}>{defaultSegmentSetting}</Box>
        )}
        <ListSection
          title={t`Segments`}
          isSubheading={isFullPage}
          action={newSegmentButton}
        >
          {segmentItems}
          {proposedSegmentItems}
          {segmentItems.length === 0 && proposedSegmentItems.length === 0 && (
            <ListEmptyItem>{t`No segments yet`}</ListEmptyItem>
          )}
        </ListSection>
        <ListSection
          title={t`Segment groups`}
          isSubheading={isFullPage}
          description={segmentGroupsDescription}
          action={newSegmentGroupButton}
        >
          {groupItems}
          {proposedGroupItems}
          {groupItems.length === 0 && proposedGroupItems.length === 0 && (
            <ListEmptyItem>{t`No segment groups yet`}</ListEmptyItem>
          )}
        </ListSection>
      </Stack>
    );
  }

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
            placeholder={
              view === "groups" ? t`Search segment groups` : t`Search segments`
            }
            onChange={setQuery}
          />
        )}
        {viewControl}
      </Stack>

      {isSearching && !hasViewMatches && (
        <ListSearchEmptyState>{t`No segments match "${query}"`}</ListSearchEmptyState>
      )}

      {view === "groups" && (!isSearching || segmentGroups.length > 0) && (
        <ListSection
          title={t`Segment groups`}
          isSubheading={isFullPage}
          description={segmentGroupsDescription}
          action={newSegmentGroupButton}
        >
          {groupItems.length > 0 ? (
            groupItems
          ) : (
            <ListEmptyItem>{t`No segment groups yet`}</ListEmptyItem>
          )}
        </ListSection>
      )}

      {view === "custom" && defaultSegmentSetting}

      {view === "custom" &&
        (!isSearching ||
          customSegments.length > 0 ||
          systemSegments.length > 0) && (
          <ListSection
            title={t`Segments`}
            isSubheading={isFullPage}
            action={newSegmentButton}
          >
            {segmentItems.length > 0 ? (
              segmentItems
            ) : (
              <ListEmptyItem>{t`No segments yet`}</ListEmptyItem>
            )}
          </ListSection>
        )}

      {view === "groups" && hasGroupProposals && (
        <ListSection
          title={t`Proposed segment groups`}
          isSubheading={isFullPage}
          description={t`Partitions from statuses, flags, and values. Accepting one makes a segment for each of its groups, and the group itself.`}
        >
          {getProposedGroupItems(false)}
        </ListSection>
      )}

      {view === "custom" && (!isSearching || matchingProposals.length > 0) && (
        <ListSection
          title={t`Proposed segments`}
          isSubheading={isFullPage}
          description={t`Rows in each bucket of a status, like Won or Lost, and rows that reached a milestone date, like Activated. Accepting one makes it a custom segment. None is a default segment unless you pick it.`}
        >
          {matchingProposals.length > 0 ? (
            getProposedSegmentItems(false)
          ) : (
            <ListEmptyItem>{t`No proposed segments`}</ListEmptyItem>
          )}
        </ListSection>
      )}
    </Stack>
  );
}
