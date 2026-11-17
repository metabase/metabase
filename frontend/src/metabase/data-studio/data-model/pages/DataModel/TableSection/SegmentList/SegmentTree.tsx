import { useState } from "react";
import { t } from "ttag";

import { trackSegmentCreateStarted } from "metabase/common/data-studio/analytics";
import { getUserCanWriteSegments } from "metabase/common/data-studio/selectors";
import {
  type SegmentGroup,
  createSegmentGroupId,
  getSegmentGroupKindLabel,
  useSegmentGroups,
} from "metabase/metadata/segment-groups";
import {
  type CohortProposal,
  getSystemSegmentRoleLabel,
  useTableSegments,
} from "metabase/metadata/table-segments";
import { useSelector } from "metabase/redux";
import { Badge, Button, Icon, Stack, Text, Title, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Segment, Table } from "metabase-types/api";

import {
  ClausePills,
  FilterClausePickers,
  type QueryClause,
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
import {
  applyConditions,
  getFilterNames,
  isDefaultSegment,
  useTableQuery,
  useTableSegmentsModel,
} from "../table-segments";

import {
  useCohortProposalActions,
  useCohortProposals,
} from "./CohortProposals";
import {
  useSegmentGroupProposalActions,
  useSegmentGroupProposals,
} from "./SegmentGroups";
import { DefaultSegmentBadge } from "./SegmentItem";
import type { SegmentListUrls } from "./SegmentList";
import { useInlineSegmentSaves } from "./use-inline-segment-saves";

const STAGE_INDEX = -1;

const hasFilters = (query: Lib.Query) =>
  Lib.filters(query, STAGE_INDEX).length > 0;

const renderFilterPickers = (
  query: Lib.Query,
  onChange: (query: Lib.Query) => void,
) => <FilterClausePickers query={query} onChange={onChange} />;

const renderReadOnlyFilterPickers = (query: Lib.Query) => (
  <FilterClausePickers query={query} />
);

// `null` makes a new group; `undefined` means the modal is closed
type EditingGroup = SegmentGroup | null | undefined;

/**
 * PROTOTYPE: the table's business segments as one searchable list, with
 * segment groups as folders that segments and other groups drag into and out
 * of; default and proposed segments get lists of their own. Segments and
 * proposals edit in place, and New adds an editable row at the top.
 */
export function SegmentTree({
  table,
  urls,
}: {
  table: Table;
  urls: SegmentListUrls;
}) {
  const model = useTableSegmentsModel(table);
  const { baseQuery } = model;
  const { fromDefinition } = useTableQuery(table);
  const getClauses = useDefinitionClauses(table);
  const proposals = useCohortProposals(table);
  const { accept, dismiss } = useCohortProposalActions(table, baseQuery);
  const { resolveCohort } = useTableSegments();
  const saves = useInlineSegmentSaves();
  const { getEditableItem, newItemKey, startNewItem } = useInlineItemEditor();
  const groupProposals = useSegmentGroupProposals(table);
  const groupProposalActions = useSegmentGroupProposalActions(table, baseQuery);
  const { getSegmentGroups, saveSegmentGroup, deleteSegmentGroup } =
    useSegmentGroups();
  const canCreateSegment = useSelector((state) =>
    getUserCanWriteSegments(state, table.is_published),
  );
  const [editingGroup, setEditingGroup] = useState<EditingGroup>();

  const segments = table.segments ?? [];
  const groups = getSegmentGroups(table);
  const groupedIds = new Set(
    groups.flatMap(({ members }) => members.map(({ segmentId }) => segmentId)),
  );

  // A definition the query library can't read shows as it is, uneditable
  const readDefinition = (segment: Segment) => {
    try {
      return fromDefinition(segment.definition);
    } catch {
      return undefined;
    }
  };

  const toSegmentNode = (segment: Segment, parentId: string): TreeItemNode => {
    const query = canCreateSegment ? readDefinition(segment) : undefined;
    const node = {
      kind: "item",
      id: `${parentId}:segment:${segment.id}`,
      memberId: segment.id,
      icon: "segment",
      badges: isDefaultSegment(model.defaultSegment, {
        type: "custom",
        segmentId: segment.id,
      }) && <DefaultSegmentBadge />,
    } satisfies Partial<TreeItemNode>;
    if (!query) {
      return {
        ...node,
        name: segment.name,
        href: urls.segment(segment.id),
        definition: (
          <SegmentDefinition clauses={getClauses(segment.definition)} />
        ),
      };
    }
    // A segment in two groups shares its edits between its rows
    return {
      ...node,
      ...getEditableItem({
        key: `segment:${segment.id}`,
        kind: "saved",
        saved: { name: segment.name, query },
        namePlaceholder: segment.name,
        isValid: hasFilters,
        renderPicker: renderFilterPickers,
        onSave: (draft) => saves.update(segment, draft),
        actions: (
          <ItemRowMenu
            detailsUrl={urls.segment(segment.id)}
            removeCopy={{
              label: t`Remove segment`,
              title: t`Remove this segment?`,
              message: t`This segment will be permanently removed.`,
            }}
            onRemove={() => saves.remove(segment)}
          />
        ),
      }),
    };
  };

  const toProposedNode = (proposal: CohortProposal): TreeItemNode => {
    const query = baseQuery && applyConditions(baseQuery, [proposal.condition]);
    const node = {
      kind: "item",
      id: `proposed:${proposal.key}`,
      memberId: null,
      icon: "segment",
      isMuted: true,
    } satisfies Partial<TreeItemNode>;
    const actions = (
      <ProposalActions
        canAccept={canCreateSegment}
        onAccept={() => accept(proposal)}
        onDismiss={() => dismiss(proposal)}
      />
    );
    if (!canCreateSegment || !query) {
      return {
        ...node,
        name: proposal.name,
        definition: query && (
          <SegmentDefinition
            clauses={getFilterNames(query).map((name) => ({
              kind: "filter",
              name,
            }))}
          />
        ),
        actions,
      };
    }
    // Saving makes the segment and retires the proposal; Cancel leaves it
    // proposed
    return {
      ...node,
      ...getEditableItem({
        key: `proposed:${proposal.key}`,
        kind: "proposal",
        saved: { name: proposal.name, query },
        namePlaceholder: proposal.name,
        isMuted: true,
        isValid: hasFilters,
        // A proposal's filters can be looked at, not changed
        renderPicker: renderReadOnlyFilterPickers,
        onSave: async (draft) => {
          const saved = await saves.create(draft, {
            fallbackName: proposal.name,
            description: proposal.signal,
          });
          if (saved) {
            resolveCohort(table, proposal.key);
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
          icon: "segment",
          ...getEditableItem({
            key: newItemKey,
            kind: "new",
            saved: { name: "", query: baseQuery },
            namePlaceholder: t`New segment`,
            isValid: hasFilters,
            renderPicker: renderFilterPickers,
            onSave: (draft) =>
              saves.create(draft, { fallbackName: t`New segment` }),
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
          {group.kind === "partition" && group.other
            ? t`${getSegmentGroupKindLabel(group.kind)} · with Other`
            : getSegmentGroupKindLabel(group.kind)}
        </Text>
      ),
      actions: canCreateSegment && (
        <GroupRowMenu
          onEdit={() => setEditingGroup(group)}
          onDelete={() => handleDeleteGroup(group)}
        />
      ),
      children: [
        ...childGroups,
        ...group.members.flatMap(({ segmentId }) => {
          const segment = segments.find(({ id }) => id === segmentId);
          return segment ? [toSegmentNode(segment, `group:${group.id}`)] : [];
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
          labels={proposal.members.map(({ label }) => label)}
          icon="segment"
          hasOther={proposal.other}
        />
      ),
      actions: (
        <ProposalActions
          canAccept={canCreateSegment}
          onAccept={() => groupProposalActions.accept(proposal)}
          onDismiss={() => groupProposalActions.dismiss(proposal)}
        />
      ),
      children: [],
    }),
  );
  const systemNodes = model.systemSegments.map(
    (segment): TreeItemNode => ({
      kind: "item",
      id: `system:${segment.role}`,
      // System segments aren't saved segments, so groups can't hold them
      memberId: null,
      name: segment.label,
      icon: "segment",
      href: urls.systemSegment(segment.role),
      definition:
        segment.memberLabels.length > 0 ? (
          <GroupMemberPills labels={segment.memberLabels} icon="segment" />
        ) : (
          <SegmentDefinition
            clauses={segment.filterNames.map((name) => ({
              kind: "filter",
              name,
            }))}
          />
        ),
      badges: (
        <>
          {isDefaultSegment(model.defaultSegment, {
            type: "system",
            role: segment.role,
          }) && <DefaultSegmentBadge />}
          <Badge variant="light" color="neutral" flex="0 0 auto">
            {getSystemSegmentRoleLabel(segment.role)}
          </Badge>
        </>
      ),
    }),
  );
  const ungroupedNodes = segments
    .filter(({ id }) => !groupedIds.has(id))
    .map((segment) => toSegmentNode(segment, "top"));
  // Business segments and their groups, under a new segment being added;
  // default and proposed segments get their own lists below
  const nodes: TreeNode[] = [
    ...(newNode ? [newNode] : []),
    ...groupNodes,
    ...ungroupedNodes,
  ];
  const proposalNodes: TreeNode[] = [
    ...proposedGroupNodes,
    ...proposals.map(toProposedNode),
  ];

  // Moving takes a segment out of one group and puts it into another
  const handleMove = (
    segmentId: number,
    fromGroupId: string | null,
    toGroupId: string | null,
  ) => {
    const segment = segments.find(({ id }) => id === segmentId);
    if (!segment) {
      return;
    }
    groups.forEach((group) => {
      if (group.id === fromGroupId) {
        saveSegmentGroup(table, {
          ...group,
          members: group.members.filter(
            (member) => member.segmentId !== segmentId,
          ),
        });
      }
      if (
        group.id === toGroupId &&
        !group.members.some((member) => member.segmentId === segmentId)
      ) {
        saveSegmentGroup(table, {
          ...group,
          members: [...group.members, { segmentId, label: segment.name }],
        });
      }
    });
  };

  const handleMoveGroup = (groupId: string, toGroupId: string | null) => {
    const group = groups.find(({ id }) => id === groupId);
    if (group) {
      saveSegmentGroup(table, {
        ...group,
        parentGroupId: toGroupId ?? undefined,
      });
    }
  };

  // Groups inside a deleted group move up into its parent
  const handleDeleteGroup = (group: SegmentGroup) => {
    groups
      .filter(({ parentGroupId }) => parentGroupId === group.id)
      .forEach((child) =>
        saveSegmentGroup(table, {
          ...child,
          parentGroupId: group.parentGroupId,
        }),
      );
    deleteSegmentGroup(table, group.id);
  };

  const handleSaveGroup = ({ name, partition }: GroupSettings) => {
    const kind = partition?.kind ?? "partition";
    saveSegmentGroup(table, {
      id: editingGroup?.id ?? createSegmentGroupId(),
      name,
      kind,
      members: editingGroup?.members ?? [],
      other: kind === "partition" && (partition?.other ?? false),
      source: editingGroup?.source ?? "admin",
      sourceFieldId: editingGroup?.sourceFieldId,
      isAdminEdited: editingGroup != null && editingGroup.source !== "admin",
      parentGroupId: editingGroup?.parentGroupId,
    });
    setEditingGroup(undefined);
  };

  return (
    <Stack gap={rem(48)}>
      <GroupedItemTree
        nodes={nodes}
        groupIcon="segment_group"
        searchPlaceholder={t`Search segments`}
        newItemButton={
          canCreateSegment && (
            <Button
              variant="filled"
              size="lg"
              leftSection={<Icon name="add" />}
              // One new row at a time
              disabled={!baseQuery || newItemKey != null}
              onClick={() => {
                if (baseQuery) {
                  trackSegmentCreateStarted(
                    "data_studio_segments",
                    Number(table.id),
                  );
                  startNewItem(baseQuery);
                }
              }}
            >
              {t`New segment`}
            </Button>
          )
        }
        newGroupLabel={t`New segment group`}
        onNewGroup={canCreateSegment ? () => setEditingGroup(null) : undefined}
        emptyMessage={t`No custom segments yet`}
        emptyIcon="segment"
        definitionHeader={t`Definition`}
        onMove={handleMove}
        onMoveGroup={handleMoveGroup}
      />
      {systemNodes.length > 0 && (
        <Stack gap="md">
          <Stack gap="xs">
            <Title order={4}>{t`Default segments`}</Title>
            <Text c="text-secondary">
              {t`Sync creates these from this table's deleted, current-record and test-data columns. People's questions start with the default one applied, as filters they can remove.`}
            </Text>
          </Stack>
          <GroupedItemTree
            nodes={systemNodes}
            emptyMessage={t`No default segments`}
            emptyIcon="segment"
            definitionHeader={t`Definition`}
          />
        </Stack>
      )}
      {proposalNodes.length > 0 && (
        <Stack gap="md">
          <Title order={4}>{t`Proposed segments and groups`}</Title>
          <GroupedItemTree
            nodes={proposalNodes}
            groupIcon="segment_group"
            emptyMessage={t`No proposed segments`}
            emptyIcon="segment"
            definitionHeader={t`Definition`}
          />
        </Stack>
      )}
      {editingGroup !== undefined && (
        <GroupSettingsModal
          // Fresh state per group
          key={editingGroup?.id ?? "new"}
          title={editingGroup ? t`Edit segment group` : t`New segment group`}
          namePlaceholder={t`Deal outcome`}
          initialSettings={{
            name: editingGroup?.name ?? "",
            partition: {
              kind: editingGroup?.kind ?? "partition",
              other: editingGroup?.other ?? false,
            },
          }}
          partitionLabels={{
            partition: getSegmentGroupKindLabel("partition"),
            overlapping: getSegmentGroupKindLabel("overlapping"),
          }}
          onSave={handleSaveGroup}
          onClose={() => setEditingGroup(undefined)}
        />
      )}
    </Stack>
  );
}

function SegmentDefinition({
  clauses,
}: {
  clauses: QueryClause[] | undefined;
}) {
  return clauses && clauses.length > 0 ? (
    <ClausePills clauses={clauses} />
  ) : null;
}
