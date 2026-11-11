import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMeasureCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteMeasures } from "metabase/common/data-studio/selectors";
import { useMeasureGroups } from "metabase/metadata/measure-groups";
import { useSelector } from "metabase/redux";
import { useNavigate, useSearchParams } from "metabase/router";
import { Button, Icon, Stack, Tabs, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  ConcreteTableId,
  Measure,
  MeasureId,
  Table,
} from "metabase-types/api";

import { getQueryClauses } from "../ClausePills";
import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import { ListEmptyItem, type ListLayout, ListSection } from "../ListSection";
import { useTableQuery } from "../table-segments";

import {
  MeasureGroupItem,
  MeasureGroupProposalItem,
  getMemberNames,
  useMeasureGroupProposals,
} from "./MeasureGroups";
import { MeasureItem } from "./MeasureItem";
import { MeasureProposalItem, useMeasureProposals } from "./MeasureProposals";

/** Where the list's measures open; the Library and Connected data differ */
export type MeasureListUrls = {
  measure: (measureId: MeasureId) => string;
  newMeasure: string;
  measureGroup: (groupId: string) => string;
  newMeasureGroup: string;
};

type MeasureListProps = {
  table: Table;
  /** Defaults to Connected data's measure pages */
  getUrls?: (table: Table) => MeasureListUrls;
  /** Off hides the search box; the lists then show everything */
  isSearchable?: boolean;
  /** A full page: 17px section subheadings, and more room between sections */
  isFullPage?: boolean;
  /** Tabs for measures and groups, or one page of sections with proposals inline */
  layout?: ListLayout;
};

function getDataModelMeasureUrls(table: Table): MeasureListUrls {
  const tableParams = {
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
  };
  return {
    measure: (measureId) =>
      Urls.dataStudioDataModelMeasure({ ...tableParams, measureId }),
    newMeasure: Urls.newDataStudioDataModelMeasure(tableParams),
    measureGroup: (groupId) =>
      Urls.dataStudioDataModelMeasureGroup({ ...tableParams, groupId }),
    newMeasureGroup: Urls.newDataStudioDataModelMeasureGroup(tableParams),
  };
}

type MeasureView = "measures" | "groups";

const getViewOptions = (): { value: MeasureView; label: string }[] => [
  { value: "measures", label: t`Measures` },
  { value: "groups", label: t`Groups` },
];

/**
 * The table's measures and, on their own tab, the groups that organize them,
 * each with what sync proposes. Groups don't change what measures compute.
 */
export function MeasureList({
  table,
  getUrls,
  isSearchable = true,
  isFullPage = false,
  layout = "tabs",
}: MeasureListProps) {
  const measures = table.measures ?? [];
  const { query: baseQuery, fromDefinition } = useTableQuery(table);
  // Each aggregation and filter of a measure's definition, for its card's pills
  const getMeasureClauses = (measure: Measure) => {
    try {
      return getQueryClauses(fromDefinition(measure.definition));
    } catch {
      // A definition the query library can't read keeps its server description
      return undefined;
    }
  };
  const [query, setQuery] = useState("");
  // Pages that return to the groups ask for them with `?view=groups`
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<MeasureView>(
    () =>
      getViewOptions().find(
        (option) => option.value === searchParams.get("view"),
      )?.value ?? "measures",
  );
  const navigate = useNavigate();
  const { getMeasureGroups } = useMeasureGroups();
  const groupProposals = useMeasureGroupProposals(table);
  const measureProposals = useMeasureProposals(table, baseQuery);
  const canWriteMeasures = useSelector((state) =>
    getUserCanWriteMeasures(state, table.is_published),
  );
  const isSearching = query.trim() !== "";

  const measureGroups = getMeasureGroups(table).filter((group) =>
    matchesListSearch(
      query,
      group.name,
      ...getMemberNames(group.measureIds, measures),
    ),
  );
  const matchingMeasures = measures.filter((measure) =>
    matchesListSearch(query, measure.name),
  );
  const matchingGroupProposals = groupProposals.proposals.filter((proposal) =>
    matchesListSearch(query, proposal.name),
  );
  const matchingMeasureProposals = measureProposals.proposals.filter(
    (proposal) => matchesListSearch(query, proposal.name),
  );
  const hasViewMatches =
    view === "groups"
      ? measureGroups.length > 0 || matchingGroupProposals.length > 0
      : matchingMeasures.length > 0 || matchingMeasureProposals.length > 0;

  const urls = getUrls?.(table) ?? getDataModelMeasureUrls(table);
  const onNewMeasureClick = () => {
    // Unjustified type cast. FIXME
    trackMeasureCreateStarted(table.id as ConcreteTableId);
  };

  const newMeasureButton = canWriteMeasures && (
    <Button
      component={ForwardRefLink}
      to={urls.newMeasure}
      variant="filled"
      size="md"
      leftSection={<Icon name="add" />}
      onAuxClick={onNewMeasureClick}
      onClickCapture={onNewMeasureClick}
    >
      {t`New measure`}
    </Button>
  );
  const newMeasureGroupButton = canWriteMeasures && (
    <Button
      component={ForwardRefLink}
      to={urls.newMeasureGroup}
      variant="filled"
      size="md"
      leftSection={<Icon name="add" />}
    >
      {t`New measure group`}
    </Button>
  );
  const measureItems = matchingMeasures.map((measure) => (
    <MeasureItem
      key={measure.id}
      measure={measure}
      href={urls.measure(measure.id)}
      clauses={getMeasureClauses(measure)}
    />
  ));
  const getProposedMeasureItems = (isMuted: boolean) =>
    matchingMeasureProposals.map((proposal) => (
      <MeasureProposalItem
        key={proposal.key}
        proposal={proposal}
        canAccept={canWriteMeasures}
        isMuted={isMuted}
        onAccept={() => measureProposals.accept(proposal)}
        onDismiss={() => measureProposals.dismiss(proposal)}
      />
    ));
  const groupItems = measureGroups.map((group) => (
    <MeasureGroupItem
      key={group.id}
      group={group}
      measures={measures}
      onOpen={
        canWriteMeasures
          ? () => navigate(urls.measureGroup(group.id))
          : undefined
      }
    />
  ));
  const getProposedGroupItems = (isMuted: boolean) =>
    matchingGroupProposals.map((proposal) => (
      <MeasureGroupProposalItem
        key={proposal.key}
        proposal={proposal}
        measures={measures}
        canAccept={canWriteMeasures}
        isMuted={isMuted}
        onAccept={() => groupProposals.accept(proposal)}
        onDismiss={() => groupProposals.dismiss(proposal)}
      />
    ));

  if (layout === "sections") {
    // One page: measures, then groups, each with its proposals mixed in
    const proposedMeasureItems = getProposedMeasureItems(true);
    const proposedGroupItems = getProposedGroupItems(true);
    return (
      <Stack
        gap={isFullPage ? rem(48) : "xl"}
        // With the page's 24px top padding, matches the 48px gap below
        pt={isFullPage ? "xl" : 0}
        data-testid="table-measures-page"
      >
        {isSearchable && (
          <ListSearchBar
            value={query}
            placeholder={t`Search measures and groups`}
            onChange={setQuery}
          />
        )}
        <ListSection
          title={t`Measures`}
          isSubheading={isFullPage}
          action={newMeasureButton}
        >
          {measureItems}
          {proposedMeasureItems}
          {measureItems.length === 0 && proposedMeasureItems.length === 0 && (
            <ListEmptyItem>{t`No measures yet`}</ListEmptyItem>
          )}
        </ListSection>
        <ListSection
          title={t`Measure groups`}
          isSubheading={isFullPage}
          action={newMeasureGroupButton}
        >
          {groupItems}
          {proposedGroupItems}
          {groupItems.length === 0 && proposedGroupItems.length === 0 && (
            <ListEmptyItem>{t`No measure groups yet`}</ListEmptyItem>
          )}
        </ListSection>
      </Stack>
    );
  }

  return (
    <Stack
      // A full page spaces its tabs and sections at twice the drawer's 24px
      gap={isFullPage ? rem(48) : "xl"}
      data-testid="table-measures-page"
    >
      {/* The view control belongs to the search, so it sits closer than the lists */}
      <Stack gap="md">
        {isSearchable && (
          <ListSearchBar
            value={query}
            placeholder={
              view === "groups" ? t`Search measure groups` : t`Search measures`
            }
            onChange={setQuery}
          />
        )}
        <Tabs
          value={view}
          onChange={(value) => {
            const next = getViewOptions().find(
              (option) => option.value === value,
            );
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
      </Stack>

      {isSearching && !hasViewMatches && (
        <ListSearchEmptyState>{t`No measures match "${query}"`}</ListSearchEmptyState>
      )}

      {view === "measures" && (!isSearching || matchingMeasures.length > 0) && (
        <ListSection
          title={t`Measures`}
          isSubheading={isFullPage}
          action={newMeasureButton}
        >
          {measureItems.length > 0 ? (
            measureItems
          ) : (
            <ListEmptyItem>{t`No measures yet`}</ListEmptyItem>
          )}
        </ListSection>
      )}

      {view === "measures" &&
        (!isSearching || matchingMeasureProposals.length > 0) && (
          <ListSection
            title={t`Proposed measures`}
            isSubheading={isFullPage}
            description={t`A row count, and the total of each amount column. Accepting one makes it a measure.`}
          >
            {matchingMeasureProposals.length > 0 ? (
              getProposedMeasureItems(false)
            ) : (
              <ListEmptyItem>{t`No proposed measures`}</ListEmptyItem>
            )}
          </ListSection>
        )}

      {view === "groups" && (!isSearching || measureGroups.length > 0) && (
        <ListSection
          title={t`Measure groups`}
          isSubheading={isFullPage}
          action={newMeasureGroupButton}
        >
          {groupItems.length > 0 ? (
            groupItems
          ) : (
            <ListEmptyItem>{t`No measure groups yet`}</ListEmptyItem>
          )}
        </ListSection>
      )}

      {view === "groups" &&
        (!isSearching || matchingGroupProposals.length > 0) && (
          <ListSection
            title={t`Proposed measure groups`}
            isSubheading={isFullPage}
            description={t`Measures grouped by what they measure. Accept one to make it a group.`}
          >
            {matchingGroupProposals.length > 0 ? (
              getProposedGroupItems(false)
            ) : (
              <ListEmptyItem>{t`No proposed measure groups`}</ListEmptyItem>
            )}
          </ListSection>
        )}
    </Stack>
  );
}
