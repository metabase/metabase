import type { Row, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetCardQuery, useSearchQuery } from "metabase/api";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/lib/urls";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Box,
  Button,
  Card,
  EntityNameCell,
  Flex,
  Group,
  Icon,
  ScrollArea,
  Stack,
  Text,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type { CardId, SearchResult } from "metabase-types/api";

import S from "./ModelsPage.module.css";
import type { ModelsTreeNode } from "./types";
import { buildModelsTree } from "./utils";

const TYPE_ICONS = {
  collection: "folder",
  model: "model",
} as const;

const NAV_COLUMN = { flex: "6 1 0", min: 800, max: "100%" } as const;
const DETAIL_COLUMN = { flex: "4 1 0", min: 400, max: "100%" } as const;

function getSelectedModelCount(rowSelection: RowSelectionState): number {
  return Object.entries(rowSelection).filter(
    ([key, selected]) => selected && key.startsWith("model:"),
  ).length;
}

function useColumns(): TreeTableColumnDef<ModelsTreeNode>[] {
  return useMemo(
    () => [
      {
        id: "name",
        header: t`Name`,
        cell: ({ row }: { row: Row<ModelsTreeNode> }) => (
          <EntityNameCell
            icon={TYPE_ICONS[row.original.type]}
            name={row.original.name}
          />
        ),
      },
      {
        id: "collection",
        header: t`Collection`,
        width: 200,
        cell: ({ row }: { row: Row<ModelsTreeNode> }) => {
          if (row.original.type !== "model") {
            return null;
          }
          return row.original.collectionName ?? null;
        },
      },
      {
        id: "description",
        header: t`Description`,
        minWidth: 200,
        cell: ({ row }: { row: Row<ModelsTreeNode> }) => {
          if (row.original.type !== "model") {
            return null;
          }
          return row.original.description ? (
            <Ellipsified>{row.original.description}</Ellipsified>
          ) : null;
        },
      },
    ],
    [],
  );
}

export function ModelsPage() {
  const [selectedModelId, setSelectedModelId] = useState<CardId | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const {
    data: searchData,
    error,
    isLoading,
  } = useSearchQuery({
    models: ["dataset"],
    filter_items_in_personal_collection: "exclude",
    model_ancestors: true,
  });

  const models = searchData?.data as
    | SearchResult<number, "dataset">[]
    | undefined;

  const columns = useColumns();
  const treeData = useMemo(() => buildModelsTree(models ?? []), [models]);

  const selectedModelCount = getSelectedModelCount(rowSelection);
  const hasCheckedModels = selectedModelCount > 0;

  const selectedRowId = useMemo(
    () =>
      !hasCheckedModels && selectedModelId != null
        ? `model:${selectedModelId}`
        : null,
    [selectedModelId, hasCheckedModels],
  );

  const handleRowClick = useCallback((row: Row<ModelsTreeNode>) => {
    if (row.original.type === "model" && row.original.modelId != null) {
      setSelectedModelId(row.original.modelId);
    }
  }, []);

  const handleRowActivate = useCallback((row: Row<ModelsTreeNode>) => {
    if (row.original.type === "model" && row.original.modelId != null) {
      setSelectedModelId(row.original.modelId);
    }
  }, []);

  const instance = useTreeTableInstance({
    data: treeData,
    columns,
    getSubRows: (node) => node.children,
    getNodeId: (node) => node.id,
    getRowCanExpand: (row: Row<ModelsTreeNode>) =>
      row.original.type === "collection",
    defaultExpanded: true,
    enableRowSelection: true,
    enableSubRowSelection: true,
    rowSelection,
    onRowSelectionChange: setRowSelection,
    selectedRowId,
    onRowActivate: handleRowActivate,
  });

  return (
    <Flex
      bg="background-secondary"
      data-testid="models-page"
      h="100%"
      style={{ overflow: "auto" }}
    >
      <PageContainer
        maw={NAV_COLUMN.max}
        miw={NAV_COLUMN.min}
        flex={NAV_COLUMN.flex}
        className={S.column}
        gap={0}
      >
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>{t`Models`}</DataStudioBreadcrumbs>
          }
        />
        <Stack mih={0} flex="0 1 auto" style={{ overflow: "hidden" }}>
          <Box
            mih={0}
            flex="0 1 auto"
            display="flex"
            className={S.treeContainer}
          >
            <Card withBorder p={0} flex={1} mih={0} display="flex">
              <LoadingAndErrorWrapper error={error} loading={isLoading}>
                <TreeTable
                  instance={instance}
                  showCheckboxes
                  onRowClick={handleRowClick}
                  ariaLabel={t`Models`}
                  emptyState={t`No models found`}
                />
              </LoadingAndErrorWrapper>
            </Card>
          </Box>
        </Stack>
      </PageContainer>

      {hasCheckedModels && (
        <ModelBulkActionsPanel
          selectedCount={selectedModelCount}
          onClose={() => setRowSelection({})}
        />
      )}

      {!hasCheckedModels && selectedModelId != null && (
        <ModelDetailPanel
          modelId={selectedModelId}
          onClose={() => setSelectedModelId(null)}
        />
      )}
    </Flex>
  );
}

interface ModelBulkActionsPanelProps {
  selectedCount: number;
  onClose: () => void;
}

function ModelBulkActionsPanel({
  selectedCount,
  onClose,
}: ModelBulkActionsPanelProps) {
  return (
    <Stack
      className={S.column}
      flex={DETAIL_COLUMN.flex}
      h="100%"
      maw={DETAIL_COLUMN.max}
      miw={DETAIL_COLUMN.min}
      gap={0}
    >
      <Group
        justify="space-between"
        w="100%"
        data-testid="model-bulk-actions-header"
        py="lg"
        bg="background-secondary"
        className={S.header}
        px="lg"
      >
        <DataStudioBreadcrumbs>{t`Bulk actions`}</DataStudioBreadcrumbs>
        <Button
          leftSection={<Icon name="close" c="text-secondary" />}
          variant="subtle"
          p="sm"
          size="compact-sm"
          onClick={onClose}
        />
      </Group>
      <ScrollArea flex={1} px="lg" type="hover">
        <Stack gap="lg" py="md">
          <Text fw="bold" fz="lg">
            {t`${selectedCount} models selected`}
          </Text>

          <Stack gap="sm">
            <Button
              leftSection={<Icon name="transform" />}
              variant="default"
              fullWidth
              justify="flex-start"
            >
              {t`Convert to a transform`}
            </Button>
            <Button
              leftSection={<Icon name="eye_outline" />}
              variant="default"
              fullWidth
              justify="flex-start"
            >
              {t`Convert to a view`}
            </Button>
          </Stack>
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

interface ModelDetailPanelProps {
  modelId: CardId;
  onClose: () => void;
}

function ModelDetailPanel({ modelId, onClose }: ModelDetailPanelProps) {
  const { data: card, error, isLoading } = useGetCardQuery({ id: modelId });

  return (
    <Stack
      className={S.column}
      flex={DETAIL_COLUMN.flex}
      h="100%"
      justify={error ? "center" : undefined}
      maw={DETAIL_COLUMN.max}
      miw={DETAIL_COLUMN.min}
      gap={0}
    >
      <Group
        justify="space-between"
        w="100%"
        data-testid="model-detail-header"
        py="lg"
        bg="background-secondary"
        className={S.header}
        px="lg"
      >
        <DataStudioBreadcrumbs>{t`Model details`}</DataStudioBreadcrumbs>
        <Button
          leftSection={<Icon name="close" c="text-secondary" />}
          variant="subtle"
          p="sm"
          size="compact-sm"
          onClick={onClose}
        />
      </Group>
      <ScrollArea flex={1} px="lg" type="hover">
        <LoadingAndErrorWrapper error={error} loading={isLoading}>
          {card && (
            <Stack gap="lg" py="md">
              <Group gap="sm" align="center">
                <Icon name="model" c="brand" />
                <Text fw="bold" fz="h3" lh="h3">
                  {card.name}
                </Text>
              </Group>

              {card.description && (
                <Text c="text-secondary">{card.description}</Text>
              )}

              <Stack gap="sm">
                {card.collection && (
                  <Group gap="xs">
                    <Text c="text-secondary" fz="sm" fw="bold">
                      {t`Collection`}
                    </Text>
                    <Text fz="sm">{card.collection.name}</Text>
                  </Group>
                )}

                {card.creator && (
                  <Group gap="xs">
                    <Text c="text-secondary" fz="sm" fw="bold">
                      {t`Created by`}
                    </Text>
                    <Text fz="sm">{card.creator.common_name}</Text>
                  </Group>
                )}

                {card.created_at && (
                  <Group gap="xs">
                    <Text c="text-secondary" fz="sm" fw="bold">
                      {t`Created at`}
                    </Text>
                    <Text fz="sm">
                      {new Date(card.created_at).toLocaleDateString()}
                    </Text>
                  </Group>
                )}

                {card.updated_at && (
                  <Group gap="xs">
                    <Text c="text-secondary" fz="sm" fw="bold">
                      {t`Updated at`}
                    </Text>
                    <Text fz="sm">
                      {new Date(card.updated_at).toLocaleDateString()}
                    </Text>
                  </Group>
                )}
              </Stack>

              <Button
                component={ForwardRefLink}
                to={Urls.model({ id: card.id, name: card.name })}
                leftSection={<Icon name="external" />}
                variant="subtle"
                size="compact-sm"
              >
                {t`Go to this model`}
              </Button>
            </Stack>
          )}
        </LoadingAndErrorWrapper>
      </ScrollArea>
    </Stack>
  );
}
