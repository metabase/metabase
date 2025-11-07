import { memo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import {
  FieldOrderPicker2,
  NameDescriptionInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Group, Icon, Stack, Text, Tooltip } from "metabase/ui";
import type { Table, TableFieldOrder } from "metabase-types/api";

import { PublishModelsModal } from "../TablePicker/components/PublishModelsModal";
import { SubstituteModelModal } from "../TablePicker/components/SubstituteModelModal";

import { TableMetadataSettings } from "./TableMetadataSection";
import { TableModels } from "./TableModels";
import S from "./TableSection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

interface Props {
  table: Table;
  onSyncOptionsClick: () => void;
}

const TableSectionBase = ({ table, onSyncOptionsClick }: Props) => {
  const [updateTable] = useUpdateTableMutation();
  const [updateTableSorting] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const [isCreateModelsModalOpen, setIsCreateModelsModalOpen] = useState(false);
  const [isSubstituteModelModalOpen, setIsSubstituteModelModalOpen] =
    useState(false);

  const handleNameChange = async (name: string) => {
    const { error } = await updateTable({
      id: table.id,
      display_name: name,
    });

    if (error) {
      sendErrorToast(t`Failed to update table name`);
    } else {
      sendSuccessToast(t`Table name updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          display_name: table.display_name,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleDescriptionChange = async (description: string) => {
    const { error } = await updateTable({ id: table.id, description });

    if (error) {
      sendErrorToast(t`Failed to update table description`);
    } else {
      sendSuccessToast(t`Table description updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          description: table.description ?? "",
        });
        sendUndoToast(error);
      });
    }
  };

  const handleFieldOrderTypeChange = async (fieldOrder: TableFieldOrder) => {
    const { error } = await updateTableSorting({
      id: table.id,
      field_order: fieldOrder,
    });

    if (error) {
      sendErrorToast(t`Failed to update field order`);
    } else {
      sendSuccessToast(t`Field order updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          field_order: table.field_order,
        });
        sendUndoToast(error);
      });
    }
  };

  return (
    <Stack data-testid="table-section" gap="md" pb="xl">
      <Box
        className={S.header}
        bg="accent-gray-light"
        px="lg"
        mt="xl"
        pos="sticky"
        top={0}
      >
        <NameDescriptionInput
          description={table.description ?? ""}
          descriptionPlaceholder={t`Give this table a description`}
          name={table.display_name}
          nameIcon="table2"
          nameMaxLength={254}
          namePlaceholder={t`Give this table a name`}
          onNameChange={handleNameChange}
          onDescriptionChange={handleDescriptionChange}
        />
      </Box>

      <Box px="lg">
        <Group justify="stretch" gap="sm">
          <Button
            flex="1"
            leftSection={<Icon name="settings" />}
            onClick={onSyncOptionsClick}
            style={{
              width: "100%",
            }}
          >
            {t`Sync settings`}
          </Button>
          <Tooltip label={t`Create model and publish to a collection`}>
            <Button
              flex="1"
              onClick={() => setIsCreateModelsModalOpen(true)}
              p="sm"
              leftSection={<Icon name="add_folder" />}
              style={{
                width: "100%",
              }}
            >{t`Publish`}</Button>
          </Tooltip>
          <Tooltip label={t`Dependency graph`}>
            <Box /* wrapping with a Box because Tooltip does not work for <Button component={Link} /> */
            >
              <Button
                component={Link}
                to={getDependencyGraphUrl(table)}
                p="sm"
                leftSection={<Icon name="network" />}
                style={{
                  flexGrow: 0,
                  width: 40,
                }}
              />
            </Box>
          </Tooltip>
          <Box style={{ flexGrow: 0, width: 40 }}>
            <TableLink table={table} />
          </Box>
        </Group>
      </Box>

      <TransformLink table={table} />

      <Box px="lg">
        <TableSectionGroup title={t`Metadata`}>TODO</TableSectionGroup>
      </Box>

      <Box px="lg">
        <TableMetadataSettings table={table} />
      </Box>

      <TableModels table={table} />

      <Box
        bd="1px solid var(--mb-color-border)"
        bg="bg-white"
        bdrs="md"
        p="md"
        mx="lg"
      >
        <Text c="text-secondary" fw="bold" lh="16px" mb="md" size="sm">
          {t`Field sort order`}
        </Text>

        <FieldOrderPicker2
          value={table.field_order}
          onChange={handleFieldOrderTypeChange}
        />
      </Box>

      <PublishModelsModal
        tables={new Set([table.id])}
        isOpen={isCreateModelsModalOpen}
        onClose={() => setIsCreateModelsModalOpen(false)}
      />

      <SubstituteModelModal
        tableId={table.id}
        isOpen={isSubstituteModelModalOpen}
        onClose={() => setIsSubstituteModelModalOpen(false)}
      />
    </Stack>
  );
};

function TableLink({ table }: { table: Table }) {
  return (
    <Tooltip label={t`Go to this table`} position="top">
      <Box>
        {/* wrapping with a Box because Tooltip does not work for <Button component={Link} /> */}
        <Button
          component={Link}
          to={getQueryBuilderUrl(table)}
          aria-label={t`Go to this table`}
          leftSection={<Icon name="external" size={16} />}
          style={{
            width: "100%",
          }}
        />
      </Box>
    </Tooltip>
  );
}

function TransformLink({ table }: { table: Table }) {
  const shouldShowTransform =
    table.transform_id != null && table.data_source === "metabase-transform";

  if (!shouldShowTransform) {
    return null;
  }

  return (
    <Box
      component={Link}
      to={`/admin/transforms?id=${table.transform_id}`}
      py="sm"
      px="xl"
      style={{
        borderRadilg: 4,
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        cursor: "pointer",
        textDecoration: "none",
        backgroundColor: "rgba(5, 114, 210, 0.07)",
      }}
    >
      <Text
        size="sm"
        fw="bold"
        c="text-dark"
        style={{
          fontSize: 12,
          lineHeight: "16px",
        }}
      >
        {t`Generated by a transform`}
      </Text>
    </Box>
  );
}

function getQueryBuilderUrl(table: Table) {
  return `/question#?db=${table.db_id}&table=${table.id}`;
}

function getDependencyGraphUrl(table: Table) {
  return `/admin/tools/dependencies?id=${table.id}&type=table`;
}

export const TableSection = memo(TableSectionBase);
