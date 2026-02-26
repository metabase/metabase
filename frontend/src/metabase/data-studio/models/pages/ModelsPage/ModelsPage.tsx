import type { Row, RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useGetCardQuery,
  useSearchQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { useListTransformTagsQuery } from "metabase/api/transform-tag";
import { getTrashUndoMessage } from "metabase/archive/utils";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type {
  EntityPickerOptions,
  OmniPickerItem,
  OmniPickerValue,
} from "metabase/common/components/Pickers";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { useToast } from "metabase/common/hooks";
import {
  type SimulatedModel,
  useSimulatedTransforms,
} from "metabase/data-studio/common/SimulatedTransformsContext";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import * as Urls from "metabase/lib/urls";
import StatusLarge from "metabase/status/components/StatusLarge/StatusLarge";
import { TagMultiSelect } from "metabase/transforms/components/TagMultiSelect";
import type { TreeTableColumnDef } from "metabase/ui";
import {
  Box,
  Button,
  Card,
  EntityNameCell,
  Flex,
  Group,
  Icon,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  TreeTable,
  useTreeTableInstance,
} from "metabase/ui";
import type {
  CardId,
  DatabaseId,
  SearchResult,
  TransformTagId,
} from "metabase-types/api";

import S from "./ModelsPage.module.css";
import type { ModelsTreeNode } from "./types";
import { buildModelsTree } from "./utils";

const TYPE_ICONS = {
  collection: "folder",
  model: "model",
} as const;

const NAV_COLUMN = { flex: "6 1 0", min: 800, max: "100%" } as const;
const DETAIL_COLUMN = { flex: "4 1 0", min: 400, max: "100%" } as const;

interface SelectedDatabase {
  id: DatabaseId;
  name: string;
}

function getSelectedModelCount(rowSelection: RowSelectionState): number {
  return Object.entries(rowSelection).filter(
    ([key, selected]) => selected && key.startsWith("model:"),
  ).length;
}

function getSelectedModelIds(rowSelection: RowSelectionState): CardId[] {
  return Object.entries(rowSelection)
    .filter(([key, selected]) => selected && key.startsWith("model:"))
    .map(([key]) => Number(key.replace("model:", "")) as CardId);
}

function getSelectedModelNames(
  nodes: ModelsTreeNode[],
  selection: RowSelectionState,
): string[] {
  const names: string[] = [];
  for (const node of nodes) {
    if (node.type === "model" && selection[node.id]) {
      names.push(node.name);
    }
    if (node.children) {
      names.push(...getSelectedModelNames(node.children, selection));
    }
  }
  return names;
}

function getSelectedSimulatedModels(
  models: SearchResult<number, "dataset">[],
  selection: RowSelectionState,
): SimulatedModel[] {
  return models
    .filter((model) => selection[`model:${model.id}`])
    .map((model) => {
      const ancestors = model.collection?.effective_ancestors ?? [];
      const parentCollection = model.collection;
      const collectionPath = [
        ...ancestors.map((a) => a.name),
        ...(parentCollection ? [parentCollection.name] : []),
      ];
      return { name: model.name, collectionPath };
    });
}

function getSelectedModelDatabases(
  models: SearchResult<number, "dataset">[],
  selection: RowSelectionState,
): SelectedDatabase[] {
  const dbMap = new Map<DatabaseId, string>();
  for (const model of models) {
    if (selection[`model:${model.id}`]) {
      if (model.database_name) {
        // Prefer actual names if any selected model has one.
        dbMap.set(model.database_id, model.database_name);
      } else if (!dbMap.has(model.database_id)) {
        dbMap.set(model.database_id, t`Unknown database`);
      }
    }
  }
  return Array.from(dbMap.entries()).map(([id, name]) => ({ id, name }));
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [conversionJob, setConversionJob] = useState<{
    modelNames: string[];
    duration: number;
  } | null>(null);

  const [updateCard] = useUpdateCardMutation();
  const [sendToast] = useToast();
  const { addTransforms } = useSimulatedTransforms();

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

  const selectedDatabases = useMemo(
    () => getSelectedModelDatabases(models ?? [], rowSelection),
    [models, rowSelection],
  );

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

  const handleConfirmConvert = useCallback(
    (folderName: string) => {
      const modelNames = getSelectedModelNames(treeData, rowSelection);
      const simulatedModels = getSelectedSimulatedModels(
        models ?? [],
        rowSelection,
      );
      setShowConfirmModal(false);
      setConversionJob({
        modelNames,
        duration: Math.random() * 7000 + 3000,
      });
      addTransforms({
        transformsFolderName: folderName,
        models: simulatedModels,
      });
    },
    [treeData, models, rowSelection, addTransforms],
  );

  const handleMoveToTrash = useCallback(async () => {
    const ids = getSelectedModelIds(rowSelection);
    const names = getSelectedModelNames(treeData, rowSelection);
    const count = ids.length;

    await Promise.all(
      ids.map((id) => updateCard({ id, archived: true }).unwrap()),
    );
    setRowSelection({});

    const message =
      count === 1
        ? getTrashUndoMessage(names[0], true)
        : t`${count} models have been moved to the trash.`;

    sendToast({
      message,
      icon: "check",
      action: async () => {
        await Promise.all(
          ids.map((id) => updateCard({ id, archived: false }).unwrap()),
        );
        sendToast({
          message:
            count === 1
              ? getTrashUndoMessage(names[0], false)
              : t`${count} models have been restored.`,
          icon: "check",
        });
      },
    });
  }, [rowSelection, treeData, updateCard, sendToast]);

  // Not memoized intentionally: changing the function reference forces
  // memo'd TreeTableRowContent to re-render when selection changes.
  const getSelectionState = (row: Row<ModelsTreeNode>) => {
    if (row.getIsSelected()) {
      return "all" as const;
    }
    if (row.getIsSomeSelected()) {
      return "some" as const;
    }
    return "none" as const;
  };

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
    <>
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
                    getSelectionState={getSelectionState}
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
            onConvertToTransform={() => setShowConfirmModal(true)}
            onMoveToTrash={handleMoveToTrash}
          />
        )}

        {!hasCheckedModels && selectedModelId != null && (
          <ModelDetailPanel
            modelId={selectedModelId}
            onClose={() => setSelectedModelId(null)}
          />
        )}
      </Flex>

      <ConvertToTransformModal
        opened={showConfirmModal}
        databases={selectedDatabases}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmConvert}
      />

      {conversionJob && (
        <ConversionStatusIndicator
          modelNames={conversionJob.modelNames}
          duration={conversionJob.duration}
          onDismiss={() => setConversionJob(null)}
        />
      )}
    </>
  );
}

interface ModelBulkActionsPanelProps {
  selectedCount: number;
  onClose: () => void;
  onConvertToTransform: () => void;
  onMoveToTrash: () => void;
}

function ModelBulkActionsPanel({
  selectedCount,
  onClose,
  onConvertToTransform,
  onMoveToTrash,
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
              onClick={onConvertToTransform}
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
            <Button
              leftSection={<Icon name="refresh" />}
              variant="default"
              fullWidth
              justify="flex-start"
            >
              {t`Replace`}
            </Button>
            <Button
              leftSection={<Icon name="trash" />}
              variant="default"
              fullWidth
              justify="flex-start"
              color="danger"
              onClick={onMoveToTrash}
            >
              {t`Move to Trash`}
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

const DISMISS_DELAY = 6000;

interface ConversionStatusIndicatorProps {
  modelNames: string[];
  duration: number;
  onDismiss: () => void;
}

function ConversionStatusIndicator({
  modelNames,
  duration,
  onDismiss,
}: ConversionStatusIndicatorProps) {
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setIsComplete(true), duration);
    return () => clearTimeout(timeout);
  }, [duration]);

  useEffect(() => {
    if (isComplete) {
      const timeout = setTimeout(onDismiss, DISMISS_DELAY);
      return () => clearTimeout(timeout);
    }
  }, [isComplete, onDismiss]);

  return (
    <Box pos="fixed" style={{ bottom: "1.5rem", right: "1.5rem", zIndex: 2 }}>
      <StatusLarge
        status={{
          title: isComplete ? t`Done!` : t`Converting models…`,
          items: modelNames.map((name, index) => ({
            id: index,
            title: name,
            icon: "model",
            description: isComplete
              ? t`Converted to transform`
              : t`Converting…`,
            isInProgress: !isComplete,
            isCompleted: isComplete,
            isAborted: false,
          })),
        }}
        isActive={!isComplete}
        onDismiss={onDismiss}
      />
    </Box>
  );
}

const TRANSFORM_COLLECTION_PICKER_OPTIONS: EntityPickerOptions = {
  hasSearch: false,
  hasRecents: false,
  hasLibrary: false,
  hasRootCollection: true,
  hasPersonalCollections: false,
  hasConfirmButtons: true,
  canCreateCollections: true,
};

interface ConvertToTransformModalProps {
  opened: boolean;
  databases: SelectedDatabase[];
  onClose: () => void;
  onConfirm: (folderName: string) => void;
}

function ConvertToTransformModal({
  opened,
  databases,
  onClose,
  onConfirm,
}: ConvertToTransformModalProps) {
  const [collectionName, setCollectionName] = useState(t`Converted models`);
  const [showPicker, setShowPicker] = useState(false);
  const [tagIds, setTagIds] = useState<TransformTagId[]>([]);
  const [tagIdsInitialized, setTagIdsInitialized] = useState(false);
  const [publishToLibrary, setPublishToLibrary] = useState(true);
  const [outputToExistingTables, setOutputToExistingTables] = useState(true);
  const [autoPickJobTags, setAutoPickJobTags] = useState(true);
  const [updateDependents, setUpdateDependents] = useState(true);

  const { data: tags = [] } = useListTransformTagsQuery();

  useEffect(() => {
    if (tags.length > 0 && !tagIdsInitialized) {
      setTagIdsInitialized(true);
      const dailyTag = tags.find((tag) => tag.name === "daily");
      if (dailyTag) {
        setTagIds([dailyTag.id]);
      }
    }
  }, [tags, tagIdsInitialized]);

  const pickerValue: OmniPickerValue = useMemo(
    () => ({
      id: "root",
      model: "collection",
      namespace: "transforms",
    }),
    [],
  );

  const handlePickerChange = useCallback((item: OmniPickerItem) => {
    setCollectionName(item.name ?? t`Converted models`);
    setShowPicker(false);
  }, []);

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={t`Convert these models to transforms?`}
        size="lg"
      >
        <Stack gap="lg" mt="md">
          <Text>
            {t`We'll create a transform based on each model, with the same name.`}
          </Text>

          <Stack gap="xs">
            <Text fw="bold" fz="md">
              {t`Save new transforms here`}
            </Text>
            <Button
              variant="default"
              fullWidth
              justify="flex-start"
              leftSection={<Icon name="folder" />}
              onClick={() => setShowPicker(true)}
            >
              {collectionName}
            </Button>
          </Stack>

          <Stack gap="md">
            <Switch
              size="sm"
              label={t`Output transforms to existing tables`}
              description={t`By default, transforms will continue to output to the same table the persisted model did.`}
              checked={outputToExistingTables}
              onChange={(event) =>
                setOutputToExistingTables(event.currentTarget.checked)
              }
            />
            {!outputToExistingTables &&
              databases.map((db) => (
                <Select
                  key={db.id}
                  label={t`Target for tables based on ${db.name}`}
                  placeholder={t`Pick a schema`}
                  data={[]}
                />
              ))}
          </Stack>

          <Stack gap="xs">
            <Switch
              size="sm"
              label={t`Auto-select job tags for new transforms`}
              description={t`Transforms will be run via scheduled jobs based on the tags that they have.`}
              checked={autoPickJobTags}
              onChange={(event) =>
                setAutoPickJobTags(event.currentTarget.checked)
              }
            />
            {!autoPickJobTags && (
              <>
                <Text fw="bold" fz="md">
                  {t`Job tags for new transforms`}
                </Text>
                <Text fz="sm" c="text-secondary">
                  {t`Transforms will be run regularly by jobs based on the tags that transforms have.`}
                </Text>
                <TagMultiSelect
                  tagIds={tagIds}
                  onChange={(newTagIds) => setTagIds(newTagIds)}
                />
              </>
            )}
          </Stack>

          <Stack gap="sm">
            <Switch
              size="sm"
              label={t`Publish new tables to the Library`}
              checked={publishToLibrary}
              description={t`The output tables will be published in subfolders matching the names of the collections in which they're currently saved. It's easy to move these later.`}
              onChange={(event) =>
                setPublishToLibrary(event.currentTarget.checked)
              }
            />
          </Stack>

          <Stack gap="sm">
            <Switch
              size="sm"
              label={t`Replace data source of all existing dependents`}
              description={t`All dependents of the original models will be updated to use the output table instead. If you don't want to do this now, you can do it later with the Data Replacement tool.`}
              checked={updateDependents}
              onChange={(event) =>
                setUpdateDependents(event.currentTarget.checked)
              }
            />
          </Stack>

          <Flex justify="flex-end" gap="md" mt="md">
            <Button variant="default" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              variant="filled"
              color="brand"
              onClick={() => onConfirm(collectionName)}
            >
              {t`Convert`}
            </Button>
          </Flex>
        </Stack>
      </Modal>

      {showPicker && (
        <CollectionPickerModal
          title={t`Save transforms here`}
          value={pickerValue}
          namespaces={["transforms"]}
          onChange={handlePickerChange}
          onClose={() => setShowPicker(false)}
          options={TRANSFORM_COLLECTION_PICKER_OPTIONS}
        />
      )}
    </>
  );
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
