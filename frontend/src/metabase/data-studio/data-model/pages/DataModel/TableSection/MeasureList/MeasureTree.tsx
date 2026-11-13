import { useState } from "react";
import { t } from "ttag";

import { trackMeasureCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteMeasures } from "metabase/common/data-studio/selectors";
import {
  type MeasureGroup,
  type MeasureProposal,
  createMeasureGroupId,
  useMeasureGroups,
} from "metabase/metadata/measure-groups";
import { useSelector } from "metabase/redux";
import { Button, Icon, Stack, Text, Title, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Measure, Table } from "metabase-types/api";

import {
  AggregationClausePicker,
  ClausePills,
  getQueryClauses,
  useDefinitionClauses,
} from "../ClausePills";
import { GroupMemberPills } from "../GroupMemberList";
import {
  GroupRowMenu,
  type GroupSettings,
  GroupSettingsModal,
  GroupedItemTree,
  type TreeGroupNode,
  type TreeItemNode,
  type TreeNode,
  nestGroups,
} from "../GroupedItemTree";
import { ItemRowMenu, useInlineItemEditor } from "../InlineItemEditor";
import { ProposalActions } from "../ListSection";
import { useTableQuery } from "../table-segments";

import { getMemberNames, useMeasureGroupProposals } from "./MeasureGroups";
import type { MeasureListUrls } from "./MeasureList";
import { buildMeasureQuery, useMeasureProposals } from "./MeasureProposals";
import { useInlineMeasureSaves } from "./use-inline-measure-saves";

const STAGE_INDEX = -1;

// A measure is exactly one aggregation
const hasOneAggregation = (query: Lib.Query) =>
  Lib.aggregations(query, STAGE_INDEX).length === 1;

const renderAggregationPicker = (
  query: Lib.Query,
  onChange: (query: Lib.Query) => void,
) => <AggregationClausePicker query={query} onChange={onChange} />;

// `null` makes a new group; `undefined` means the modal is closed
type EditingGroup = MeasureGroup | null | undefined;

/**
 * PROTOTYPE: the table's measures as one searchable list, with measure groups
 * as folders that measures and other groups drag into and out of, and
 * proposals in a list of their own. Measures and proposals edit in place, and
 * New adds an editable row at the top.
 */
export function MeasureTree({
  table,
  urls,
}: {
  table: Table;
  urls: MeasureListUrls;
}) {
  const { query: baseQuery, fromDefinition } = useTableQuery(table);
  const getClauses = useDefinitionClauses(table);
  const measureProposals = useMeasureProposals(table, baseQuery);
  const groupProposals = useMeasureGroupProposals(table);
  const {
    getMeasureGroups,
    saveMeasureGroup,
    deleteMeasureGroup,
    resolveProposal,
  } = useMeasureGroups();
  const saves = useInlineMeasureSaves();
  const { getEditableItem, newItemKey, startNewItem } = useInlineItemEditor();
  const canWriteMeasures = useSelector((state) =>
    getUserCanWriteMeasures(state, table.is_published),
  );
  const [editingGroup, setEditingGroup] = useState<EditingGroup>();

  const measures = table.measures ?? [];
  const groups = getMeasureGroups(table);
  const groupedIds = new Set(groups.flatMap(({ measureIds }) => measureIds));

  // A definition the query library can't read shows as it is, uneditable
  const readDefinition = (measure: Measure) => {
    try {
      return fromDefinition(measure.definition);
    } catch {
      return undefined;
    }
  };

  const toMeasureNode = (measure: Measure, parentId: string): TreeItemNode => {
    const query = canWriteMeasures ? readDefinition(measure) : undefined;
    const node = {
      kind: "item",
      id: `${parentId}:measure:${measure.id}`,
      memberId: measure.id,
      icon: "ruler",
    } satisfies Partial<TreeItemNode>;
    if (!query) {
      const clauses = getClauses(measure.definition);
      return {
        ...node,
        name: measure.name,
        href: urls.measure(measure.id),
        definition: clauses && clauses.length > 0 && (
          <ClausePills clauses={clauses} />
        ),
      };
    }
    // A measure in two groups shares its edits between its rows
    return {
      ...node,
      ...getEditableItem({
        key: `measure:${measure.id}`,
        kind: "saved",
        saved: { name: measure.name, query },
        namePlaceholder: measure.name,
        isValid: hasOneAggregation,
        renderPicker: renderAggregationPicker,
        onSave: (draft) => saves.update(measure, draft),
        actions: <ItemRowMenu detailsUrl={urls.measure(measure.id)} />,
      }),
    };
  };

  const toProposedNode = (proposal: MeasureProposal): TreeItemNode => {
    const query = baseQuery && buildMeasureQuery(baseQuery, proposal);
    const node = {
      kind: "item",
      id: `proposed:${proposal.key}`,
      memberId: null,
      icon: "ruler",
      isMuted: true,
    } satisfies Partial<TreeItemNode>;
    const actions = (
      <ProposalActions
        canAccept={canWriteMeasures}
        onAccept={() => measureProposals.accept(proposal)}
        onDismiss={() => measureProposals.dismiss(proposal)}
      />
    );
    if (!canWriteMeasures || !query) {
      const clauses = query ? getQueryClauses(query) : [];
      return {
        ...node,
        name: proposal.name,
        definition: clauses.length > 0 && <ClausePills clauses={clauses} />,
        actions,
      };
    }
    // Saving makes the measure and retires the proposal; Cancel leaves it
    // proposed
    return {
      ...node,
      ...getEditableItem({
        key: `proposed:${proposal.key}`,
        kind: "proposal",
        saved: { name: proposal.name, query },
        namePlaceholder: proposal.name,
        isMuted: true,
        isValid: hasOneAggregation,
        renderPicker: renderAggregationPicker,
        onSave: async (draft) => {
          const saved = await saves.create(draft, {
            fallbackName: proposal.name,
            description: proposal.signal,
          });
          if (saved) {
            resolveProposal(table, proposal.key);
          }
          return saved;
        },
        actions,
      }),
    };
  };

  const newNode: TreeItemNode | null =
    newItemKey != null && baseQuery
      ? {
          kind: "item",
          id: newItemKey,
          memberId: null,
          icon: "ruler",
          ...getEditableItem({
            key: newItemKey,
            kind: "new",
            saved: { name: "", query: baseQuery },
            namePlaceholder: t`New measure`,
            isValid: hasOneAggregation,
            renderPicker: renderAggregationPicker,
            onSave: (draft) =>
              saves.create(draft, { fallbackName: t`New measure` }),
          }),
        }
      : null;

  const groupNodes = nestGroups(
    groups,
    (group, childGroups): TreeGroupNode => ({
      kind: "group",
      id: `group:${group.id}`,
      groupId: group.id,
      name: group.name,
      definition: (
        <Text c="text-secondary">
          {group.measureIds.length === 1
            ? t`1 measure`
            : t`${group.measureIds.length} measures`}
        </Text>
      ),
      actions: canWriteMeasures && (
        <GroupRowMenu
          onEdit={() => setEditingGroup(group)}
          onDelete={() => handleDeleteGroup(group)}
        />
      ),
      children: [
        ...childGroups,
        ...group.measureIds.flatMap((measureId) => {
          const measure = measures.find(({ id }) => id === measureId);
          return measure ? [toMeasureNode(measure, `group:${group.id}`)] : [];
        }),
      ],
    }),
  );
  const proposedGroupNodes = groupProposals.proposals.map(
    (proposal): TreeGroupNode => ({
      kind: "group",
      id: `proposed-group:${proposal.key}`,
      groupId: null,
      name: proposal.name,
      isMuted: true,
      definition: (
        <GroupMemberPills
          labels={getMemberNames(proposal.measureIds, measures)}
          icon="ruler"
        />
      ),
      actions: (
        <ProposalActions
          canAccept={canWriteMeasures}
          onAccept={() => groupProposals.accept(proposal)}
          onDismiss={() => groupProposals.dismiss(proposal)}
        />
      ),
      children: [],
    }),
  );
  const ungroupedNodes = measures
    .filter(({ id }) => !groupedIds.has(id))
    .map((measure) => toMeasureNode(measure, "top"));
  // Measures and their groups, under a new measure being added; proposals
  // get their own list below
  const nodes: TreeNode[] = [
    ...(newNode ? [newNode] : []),
    ...groupNodes,
    ...ungroupedNodes,
  ];
  const proposalNodes: TreeNode[] = [
    ...proposedGroupNodes,
    ...measureProposals.proposals.map(toProposedNode),
  ];

  // Moving takes a measure out of one group and puts it into another
  const handleMove = (
    measureId: number,
    fromGroupId: string | null,
    toGroupId: string | null,
  ) => {
    groups.forEach((group) => {
      if (group.id === fromGroupId) {
        saveMeasureGroup(table, {
          ...group,
          measureIds: group.measureIds.filter((id) => id !== measureId),
        });
      }
      if (group.id === toGroupId && !group.measureIds.includes(measureId)) {
        saveMeasureGroup(table, {
          ...group,
          measureIds: [...group.measureIds, measureId],
        });
      }
    });
  };

  const handleMoveGroup = (groupId: string, toGroupId: string | null) => {
    const group = groups.find(({ id }) => id === groupId);
    if (group) {
      saveMeasureGroup(table, {
        ...group,
        parentGroupId: toGroupId ?? undefined,
      });
    }
  };

  // Groups inside a deleted group move up into its parent
  const handleDeleteGroup = (group: MeasureGroup) => {
    groups
      .filter(({ parentGroupId }) => parentGroupId === group.id)
      .forEach((child) =>
        saveMeasureGroup(table, {
          ...child,
          parentGroupId: group.parentGroupId,
        }),
      );
    deleteMeasureGroup(table, group.id);
  };

  const handleSaveGroup = ({ name }: GroupSettings) => {
    saveMeasureGroup(table, {
      id: editingGroup?.id ?? createMeasureGroupId(),
      name,
      measureIds: editingGroup?.measureIds ?? [],
      source: editingGroup?.source ?? "admin",
      parentGroupId: editingGroup?.parentGroupId,
    });
    setEditingGroup(undefined);
  };

  return (
    <Stack gap={rem(48)}>
      <GroupedItemTree
        nodes={nodes}
        searchPlaceholder={t`Search measures`}
        newItemButton={
          canWriteMeasures && (
            <Button
              variant="filled"
              size="lg"
              leftSection={<Icon name="add" />}
              // One new row at a time
              disabled={!baseQuery || newItemKey != null}
              onClick={() => {
                if (baseQuery) {
                  trackMeasureCreateStarted(table.id);
                  startNewItem(baseQuery);
                }
              }}
            >
              {t`New measure`}
            </Button>
          )
        }
        newGroupLabel={t`New measure group`}
        onNewGroup={canWriteMeasures ? () => setEditingGroup(null) : undefined}
        emptyMessage={t`No measures yet`}
        emptyIcon="ruler"
        definitionHeader={t`Definition`}
        onMove={handleMove}
        onMoveGroup={handleMoveGroup}
      />
      {proposalNodes.length > 0 && (
        <Stack gap="md">
          <Title order={4}>{t`Proposed measures`}</Title>
          <GroupedItemTree
            nodes={proposalNodes}
            emptyMessage={t`No proposed measures`}
            emptyIcon="ruler"
            definitionHeader={t`Definition`}
          />
        </Stack>
      )}
      {editingGroup !== undefined && (
        <GroupSettingsModal
          // Fresh state per group
          key={editingGroup?.id ?? "new"}
          title={editingGroup ? t`Edit measure group` : t`New measure group`}
          namePlaceholder={t`Revenue`}
          initialSettings={{ name: editingGroup?.name ?? "" }}
          onSave={handleSaveGroup}
          onClose={() => setEditingGroup(undefined)}
        />
      )}
    </Stack>
  );
}
