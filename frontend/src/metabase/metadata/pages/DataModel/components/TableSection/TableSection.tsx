import { memo, useContext, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { dependencyGraph } from "metabase/lib/urls/dependencies";
import { NameDescriptionInput } from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Button, Group, Icon, Stack, Tooltip } from "metabase/ui";
import type { FieldId, Table } from "metabase-types/api";

import { DataModelContext } from "../../DataModelContext";
import { getUrl } from "../../utils";
import { PublishModelsModal } from "../TablePicker/components/PublishModelsModal";
import { SubstituteModelModal } from "../TablePicker/components/SubstituteModelModal";

import { TableFieldList } from "./TableFieldList";
import { TableMetadataInfo } from "./TableMetadataInfo";
import { TableMetadataSettings } from "./TableMetadataSection";
import { TableModels } from "./TableModels";
import S from "./TableSection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

interface Props {
  table: Table;
  activeFieldId?: FieldId;
  onSyncOptionsClick: () => void;
}

const TableSectionBase = ({
  table,
  activeFieldId,
  onSyncOptionsClick,
}: Props) => {
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const { baseUrl } = useContext(DataModelContext);
  const [isCreateModelsModalOpen, setIsCreateModelsModalOpen] = useState(false);
  const [isSubstituteModelModalOpen, setIsSubstituteModelModalOpen] =
    useState(false);

  const getFieldHref = (fieldId: FieldId) => {
    return getUrl(baseUrl, {
      databaseId: table.db_id,
      schemaName: table.schema,
      tableId: table.id,
      fieldId,
    });
  };

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
          <Button
            flex="1"
            onClick={() => setIsCreateModelsModalOpen(true)}
            p="sm"
            leftSection={<Icon name="add_folder" />}
            style={{
              width: "100%",
            }}
          >{t`Publish`}</Button>
          <Tooltip label={t`Dependency graph`}>
            <Box /* wrapping with a Box because Tooltip does not work for <Button component={Link} /> */
            >
              <Button
                component={Link}
                to={dependencyGraph({
                  entry: { id: Number(table.id), type: "table" },
                })}
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

      <Box px="lg">
        <TableMetadataSettings table={table} />
      </Box>

      <Box px="lg">
        <TableSectionGroup title={t`Metadata`}>
          <TableMetadataInfo table={table} />
        </TableSectionGroup>
      </Box>

      <Box px="lg">
        <TableSectionGroup title={t`Fields`}>
          <TableFieldList
            table={table}
            activeFieldId={activeFieldId}
            getFieldHref={getFieldHref}
          />
        </TableSectionGroup>
      </Box>

      <TableModels table={table} />

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

function getQueryBuilderUrl(table: Table) {
  return `/question#?db=${table.db_id}&table=${table.id}`;
}

export const TableSection = memo(TableSectionBase);
