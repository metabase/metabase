import { useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMeasureCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteMeasures } from "metabase/common/data-studio/selectors";
import { useMeasureGroups } from "metabase/metadata/measure-groups";
import { useSelector } from "metabase/redux";
import { Button, type ButtonProps, Icon, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ConcreteTableId, Table } from "metabase-types/api";

import {
  ListSearchBar,
  ListSearchEmptyState,
  matchesListSearch,
} from "../ListSearchBar";
import { ListSection } from "../ListSection";
import S from "../TableSection.module.css";

import { MeasureGroupModal } from "./MeasureGroupModal";
import {
  MeasureGroupItem,
  MeasureGroupProposalItem,
  getMemberNames,
  useMeasureGroupProposals,
} from "./MeasureGroups";
import { MeasureItem } from "./MeasureItem";

type MeasureListProps = {
  table: Table;
};

/**
 * The table's measure groups, its measures, and groups sync suggests. Groups
 * only organize measures; they don't change what they compute.
 */
export function MeasureList({ table }: MeasureListProps) {
  const measures = table.measures ?? [];
  const [query, setQuery] = useState("");
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

  const getMeasureHref = (measureId: number) =>
    Urls.dataStudioDataModelMeasure({
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      measureId,
    });
  const canWriteMeasures = useSelector((state) =>
    getUserCanWriteMeasures(state, table.is_published),
  );
  const onNewMeasureClick = () => {
    // Unjustified type cast. FIXME
    trackMeasureCreateStarted(table.id as ConcreteTableId);
  };
  const newMeasureUrl = Urls.newDataStudioDataModelMeasure({
    databaseId: table.db_id,
    schemaName: table.schema,
    tableId: table.id,
  });

  const renderNewMeasureButton = (variant?: ButtonProps["variant"]) =>
    canWriteMeasures && (
      <Button
        variant={variant}
        component={ForwardRefLink}
        leftSection={<Icon name="add" />}
        onAuxClick={onNewMeasureClick}
        onClickCapture={onNewMeasureClick}
        to={newMeasureUrl}
      >
        {t`New measure`}
      </Button>
    );

  // The action sits under the message, centered and blue, as the next step
  if (measures.length === 0) {
    return (
      <Stack
        align="center"
        gap="lg"
        mt={80}
        className={S.EmptyState}
        data-testid="table-measures-page"
      >
        <EmptyState
          spacing="sm"
          illustrationElement={
            <Icon name="ruler" size={32} c="text-secondary" />
          }
          title={t`No measures yet`}
          message={t`Create a measure to define a reusable aggregation for this table.`}
        />
        {renderNewMeasureButton("filled")}
      </Stack>
    );
  }

  return (
    <Stack gap="xl" data-testid="table-measures-page">
      <ListSearchBar
        value={query}
        placeholder={t`Search measures`}
        onChange={setQuery}
      >
        {renderNewMeasureButton()}
      </ListSearchBar>

      {isSearching && !hasMatches && (
        <ListSearchEmptyState>{t`No measures match "${query}"`}</ListSearchEmptyState>
      )}

      {(!isSearching || measureGroups.length > 0) && (
        <ListSection
          title={t`Measure groups`}
          description={t`Named sets of measures, listed together under a heading. They don't change what a measure computes.`}
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
            <Text c="text-secondary">{t`No measure groups yet.`}</Text>
          )}
        </ListSection>
      )}

      {matchingMeasures.length > 0 && (
        <ListSection title={t`Measures`}>
          {matchingMeasures.map((measure) => (
            <MeasureItem
              key={measure.id}
              measure={measure}
              href={getMeasureHref(measure.id)}
            />
          ))}
        </ListSection>
      )}

      {matchingProposals.length > 0 && (
        <ListSection
          title={t`Proposed groups`}
          description={t`Measures grouped by what they measure. Accept one to make it a group.`}
        >
          {matchingProposals.map((proposal) => (
            <MeasureGroupProposalItem
              key={proposal.key}
              proposal={proposal}
              measures={measures}
              canAccept={canWriteMeasures}
              onAccept={() => groupProposals.accept(proposal)}
              onDismiss={() => groupProposals.dismiss(proposal)}
            />
          ))}
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
