import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  type TableHierarchy,
  useTableHierarchies,
} from "metabase/metadata/hierarchies";
import { useNavigate } from "metabase/router";
import {
  Button,
  Card,
  EntityNameCell,
  Flex,
  Group,
  Icon,
  Stack,
  TextInput,
  TreeTable,
  type TreeTableColumnDef,
  useTreeTableInstance,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

import { InferredIcon } from "../InferenceReview";

import { HierarchyLevelPills } from "./HierarchyLevelPills";
import { HierarchyMenu } from "./HierarchyMenu";
import { useLevelColumns } from "./use-level-columns";

// Fits a ⋯ menu, as in Segments and Measures
const ACTIONS_WIDTH = 96;

/** A row of the list, keyed by its hierarchy's id */
type HierarchyRow = TableHierarchy & { id: string };

type HierarchyFlatListProps = {
  table: Table;
  getHierarchyHref: (hierarchyId: string) => string;
  newHierarchyHref: string;
};

/**
 * PROTOTYPE: mocked. A table's hierarchies (doc 06), one row each with its
 * levels as pills in order; a row opens the hierarchy's page. The ones sync
 * made carry the AI icon until someone confirms or edits them.
 */
export function HierarchyFlatList({
  table,
  getHierarchyHref,
  newHierarchyHref,
}: HierarchyFlatListProps) {
  const { items, save, remove } = useTableHierarchies(table);
  const navigate = useNavigate();
  const { sendSuccessToast } = useMetadataToasts();
  const { findColumn } = useLevelColumns(table);
  const [query, setQuery] = useState("");
  const fields = table.fields ?? [];
  const canEdit = table.can_write === true;

  const search = query.trim().toLowerCase();
  const rows = items
    .filter(({ hierarchy }) =>
      [
        hierarchy.name,
        ...hierarchy.levels.map((level) => findColumn(level)?.label ?? ""),
      ].some((name) => name.toLowerCase().includes(search)),
    )
    .map((item): HierarchyRow => ({ id: item.hierarchy.id, ...item }));

  // Rebuilt each render: the store's save/remove are new every render anyway
  const columns: TreeTableColumnDef<HierarchyRow>[] = [
    {
      id: "name",
      header: t`Name`,
      minWidth: 240,
      cell: ({ row }) => {
        const { hierarchy, inference } = row.original;
        return (
          <Group gap="sm" wrap="nowrap" miw={0}>
            <EntityNameCell icon="network" name={hierarchy.name} />
            {inference != null && (
              <InferredIcon
                description={inference}
                onConfirm={canEdit ? () => save(hierarchy) : undefined}
              />
            )}
          </Group>
        );
      },
    },
    {
      id: "levels",
      header: t`Levels or parent key`,
      minWidth: 240,
      cell: ({ row }) => (
        <HierarchyLevelPills
          hierarchy={row.original.hierarchy}
          fields={fields}
          findColumn={findColumn}
        />
      ),
    },
    {
      id: "actions",
      width: ACTIONS_WIDTH,
      cell: ({ row }) => {
        const { hierarchy } = row.original;
        return (
          <Flex justify="flex-end" w="100%">
            {canEdit && (
              <HierarchyMenu
                hierarchyName={hierarchy.name}
                onEdit={() => navigate(getHierarchyHref(hierarchy.id))}
                onDelete={() => {
                  remove(hierarchy);
                  sendSuccessToast(t`Hierarchy deleted`);
                }}
              />
            )}
          </Flex>
        );
      },
    },
  ];

  const instance = useTreeTableInstance<HierarchyRow>({
    data: rows,
    columns,
    getNodeId: ({ id }) => id,
  });

  return (
    <Stack gap="lg">
      <Flex gap="lg">
        <TextInput
          placeholder={t`Search hierarchies`}
          leftSection={<Icon name="search" />}
          bdrs="sm"
          flex="1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {canEdit && (
          <Button
            component={ForwardRefLink}
            to={newHierarchyHref}
            variant="filled"
            size="lg"
            leftSection={<Icon name="add" />}
          >
            {t`New hierarchy`}
          </Button>
        )}
      </Flex>
      <Card withBorder p={0}>
        <TreeTable
          instance={instance}
          hierarchical={false}
          emptyState={
            <ListEmptyState
              label={
                search !== ""
                  ? t`No results for "${query.trim()}"`
                  : t`No hierarchies yet`
              }
              icon="network"
            />
          }
          onRowClick={(row, event) => {
            // The row's buttons handle their own clicks
            const isButton =
              event.target instanceof Element && event.target.closest("button");
            if (!isButton) {
              navigate(getHierarchyHref(row.original.hierarchy.id));
            }
          }}
        />
      </Card>
    </Stack>
  );
}
