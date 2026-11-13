import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMeasureCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteMeasures } from "metabase/common/data-studio/selectors";
import {
  type MeasureGroup,
  createMeasureGroupId,
  useMeasureGroups,
} from "metabase/metadata/measure-groups";
import { useSelector } from "metabase/redux";
import { Button, Icon, Stack, Text, Title, rem } from "metabase/ui";
import type { Measure, Table } from "metabase-types/api";

import {
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
import { ProposalActions, getProposalHref } from "../ListSection";
import { useTableQuery } from "../table-segments";

import { getMemberNames, useMeasureGroupProposals } from "./MeasureGroups";
import type { MeasureListUrls } from "./MeasureList";
import { buildMeasureQuery, useMeasureProposals } from "./MeasureProposals";

// `null` makes a new group; `undefined` means the modal is closed
type EditingGroup = MeasureGroup | null | undefined;

/**
 * PROTOTYPE: the table's measures as one searchable list, with measure groups
 * as folders that measures and other groups drag into and out of, and
 * proposals in a list of their own
 */
export function MeasureTree({
  table,
  urls,
}: {
  table: Table;
  urls: MeasureListUrls;
}) {
  const { query: baseQuery } = useTableQuery(table);
  const getClauses = useDefinitionClauses(table);
  const measureProposals = useMeasureProposals(table, baseQuery);
  const groupProposals = useMeasureGroupProposals(table);
  const { getMeasureGroups, saveMeasureGroup, deleteMeasureGroup } =
    useMeasureGroups();
  const canWriteMeasures = useSelector((state) =>
    getUserCanWriteMeasures(state, table.is_published),
  );
  const [editingGroup, setEditingGroup] = useState<EditingGroup>();

  const measures = table.measures ?? [];
  const groups = getMeasureGroups(table);
  const groupedIds = new Set(groups.flatMap(({ measureIds }) => measureIds));

  const toMeasureNode = (measure: Measure, parentId: string): TreeItemNode => {
    const clauses = getClauses(measure.definition);
    return {
      kind: "item",
      id: `${parentId}:measure:${measure.id}`,
      memberId: measure.id,
      name: measure.name,
      icon: "ruler",
      href: urls.measure(measure.id),
      definition: clauses && clauses.length > 0 && (
        <ClausePills clauses={clauses} />
      ),
    };
  };

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
  const proposedNodes = measureProposals.proposals.map(
    (proposal): TreeItemNode => {
      const query = baseQuery && buildMeasureQuery(baseQuery, proposal);
      const clauses = query ? getQueryClauses(query) : [];
      return {
        kind: "item",
        id: `proposed:${proposal.key}`,
        memberId: null,
        name: proposal.name,
        icon: "ruler",
        isMuted: true,
        // Opens the new-measure page filled in, to review before saving
        href: canWriteMeasures
          ? getProposalHref(urls.newMeasure, proposal.key)
          : undefined,
        definition: clauses.length > 0 && <ClausePills clauses={clauses} />,
        actions: (
          <ProposalActions
            canAccept={canWriteMeasures}
            onAccept={() => measureProposals.accept(proposal)}
            onDismiss={() => measureProposals.dismiss(proposal)}
          />
        ),
      };
    },
  );
  const nodes: TreeNode[] = [...groupNodes, ...ungroupedNodes];
  // Proposals get their own list below the real measures and groups
  const proposalNodes: TreeNode[] = [...proposedGroupNodes, ...proposedNodes];

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

  const onNewMeasureClick = () => {
    trackMeasureCreateStarted(table.id);
  };

  return (
    <Stack gap={rem(48)}>
      <GroupedItemTree
        nodes={nodes}
        searchPlaceholder={t`Search measures`}
        newItemButton={
          canWriteMeasures && (
            <Button
              component={ForwardRefLink}
              to={urls.newMeasure}
              variant="filled"
              size="lg"
              leftSection={<Icon name="add" />}
              onAuxClick={onNewMeasureClick}
              onClickCapture={onNewMeasureClick}
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
