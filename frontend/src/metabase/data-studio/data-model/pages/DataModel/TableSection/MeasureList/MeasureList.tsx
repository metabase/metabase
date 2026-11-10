import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMeasureCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteMeasures } from "metabase/common/data-studio/selectors";
import { useMeasureGroups } from "metabase/metadata/measure-groups";
import { useSelector } from "metabase/redux";
import {
  Button,
  Icon,
  SegmentedControl,
  type SegmentedControlItem,
  Stack,
} from "metabase/ui";
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
import { ListEmptyItem, ListSection } from "../ListSection";
import { useTableQuery } from "../table-segments";

import { MeasureGroupModal } from "./MeasureGroupModal";
import {
  MeasureGroupItem,
  MeasureGroupProposalItem,
  getMemberNames,
  useMeasureGroupProposals,
} from "./MeasureGroups";
import { MeasureItem } from "./MeasureItem";

type MeasureView = "custom" | "proposed";

const getViewOptions = (): SegmentedControlItem<MeasureView>[] => [
  { value: "custom", label: t`Custom` },
  { value: "proposed", label: t`Proposed` },
];

export type MeasureListUrls = {
  measure: (measureId: MeasureId) => string;
  newMeasure: string;
};

type MeasureListProps = {
  table: Table;
  urls?: MeasureListUrls;
};

function getDataModelMeasureUrls(table: Table): MeasureListUrls {
  const tablePath = {
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
  };
  return {
    measure: (measureId) =>
      Urls.dataStudioDataModelMeasure({ ...tablePath, measureId }),
    newMeasure: Urls.newDataStudioDataModelMeasure(tablePath),
  };
}

/**
 * The table's measure groups, its measures, and groups sync suggests. Groups
 * only organize measures; they don't change what they compute.
 */
export function MeasureList({
  table,
  urls = getDataModelMeasureUrls(table),
}: MeasureListProps) {
  const measures = table.measures ?? [];
  const { fromDefinition } = useTableQuery(table);
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
  const [view, setView] = useState<MeasureView>("custom");
  // `null` is a new group; `undefined` means the editor is closed
  const [editingGroupId, setEditingGroupId] = useState<string | null>();
  const { getMeasureGroups, saveMeasureGroup, deleteMeasureGroup } =
    useMeasureGroups();
  const groupProposals = useMeasureGroupProposals(table);
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
  const matchingProposals = groupProposals.proposals.filter((proposal) =>
    matchesListSearch(query, proposal.name),
  );
  const hasMatches =
    measureGroups.length > 0 ||
    matchingMeasures.length > 0 ||
    matchingProposals.length > 0;
  const editingGroup =
    editingGroupId != null
      ? getMeasureGroups(table).find(({ id }) => id === editingGroupId)
      : undefined;
  // A search looks through every view at once, each in its own section
  const showsView = (viewToShow: MeasureView) =>
    !isSearching && view === viewToShow;

  const canWriteMeasures = useSelector((state) =>
    getUserCanWriteMeasures(state, table.is_published),
  );
  const onNewMeasureClick = () => {
    // Unjustified type cast. FIXME
    trackMeasureCreateStarted(table.id as ConcreteTableId);
  };
  const newMeasureUrl = urls.newMeasure;

  return (
    <Stack gap="xl" data-testid="table-measures-page">
      {/* The view control belongs to the search, so it sits closer than the lists */}
      <Stack gap="md">
        <ListSearchBar
          value={query}
          placeholder={t`Search all measures and groups`}
          onChange={setQuery}
        />
        {!isSearching && (
          <SegmentedControl<MeasureView>
            fullWidth
            data={getViewOptions()}
            value={view}
            onChange={setView}
          />
        )}
      </Stack>

      {isSearching && !hasMatches && (
        <ListSearchEmptyState>{t`No measures match "${query}"`}</ListSearchEmptyState>
      )}

      {(showsView("custom") || (isSearching && measureGroups.length > 0)) && (
        <ListSection
          title={t`Measure groups`}
          description={t`Group similar or related measures together to help your users find them when they're querying.`}
          action={
            canWriteMeasures && (
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
          {measureGroups.length > 0 ? (
            measureGroups.map((group) => (
              <MeasureGroupItem
                key={group.id}
                group={group}
                measures={measures}
                onOpen={
                  canWriteMeasures
                    ? () => setEditingGroupId(group.id)
                    : undefined
                }
              />
            ))
          ) : (
            <ListEmptyItem>{t`No measure groups yet`}</ListEmptyItem>
          )}
        </ListSection>
      )}

      {(showsView("custom") ||
        (isSearching && matchingMeasures.length > 0)) && (
        <ListSection
          title={t`Measures`}
          action={
            canWriteMeasures && (
              <Button
                component={ForwardRefLink}
                to={newMeasureUrl}
                size="compact-sm"
                variant="subtle"
                leftSection={<Icon name="add" />}
                onAuxClick={onNewMeasureClick}
                onClickCapture={onNewMeasureClick}
              >
                {t`New measure`}
              </Button>
            )
          }
        >
          {matchingMeasures.length > 0 ? (
            matchingMeasures.map((measure) => (
              <MeasureItem
                key={measure.id}
                measure={measure}
                href={urls.measure(measure.id)}
                clauses={getMeasureClauses(measure)}
              />
            ))
          ) : (
            <ListEmptyItem>{t`No measures yet`}</ListEmptyItem>
          )}
        </ListSection>
      )}

      {(showsView("proposed") ||
        (isSearching && matchingProposals.length > 0)) && (
        <ListSection
          title={t`Proposed groups`}
          description={t`Measures grouped by what they measure. Accept one to make it a group.`}
        >
          {matchingProposals.length > 0 ? (
            matchingProposals.map((proposal) => (
              <MeasureGroupProposalItem
                key={proposal.key}
                proposal={proposal}
                measures={measures}
                canAccept={canWriteMeasures}
                onAccept={() => groupProposals.accept(proposal)}
                onDismiss={() => groupProposals.dismiss(proposal)}
              />
            ))
          ) : (
            <ListEmptyItem>{t`No proposed groups`}</ListEmptyItem>
          )}
        </ListSection>
      )}

      {editingGroupId !== undefined && (
        <MeasureGroupModal
          // Fresh state per group
          key={editingGroupId ?? "new"}
          group={editingGroup}
          measures={measures}
          onSave={(group) => {
            saveMeasureGroup(table, group);
            setEditingGroupId(undefined);
          }}
          onDelete={(groupId) => {
            deleteMeasureGroup(table, groupId);
            setEditingGroupId(undefined);
          }}
          onClose={() => setEditingGroupId(undefined)}
        />
      )}
    </Stack>
  );
}
