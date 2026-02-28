import cx from "classnames";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { EditableText } from "metabase/common/components/EditableText";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import TAS from "metabase/data-studio/data-model/components/TableSection/components/TableAttributes.module.css";
import { isNullOrUndefined } from "metabase/lib/types";
import {
  DataSourceInput,
  EntityTypeInput,
  UserInput,
} from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import {
  Box,
  Card,
  Divider,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import type { Table, TableDataSource, UserId } from "metabase-types/api";

import S from "./DescriptionSection.module.css";

type DescriptionSectionProps = {
  table: Table;
};

export function DescriptionSection({ table }: DescriptionSectionProps) {
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const formattedDate = new Date(table.updated_at).toLocaleString();
  const formatNumber = useNumberFormatter();
  const isDependenciesEnabled = PLUGIN_DEPENDENCIES.isEnabled;

  const { dependentsCount } = PLUGIN_DEPENDENCIES.useGetDependenciesCount({
    id: Number(table.id),
    type: "table",
  });

  const handleChange = async (newValue: string) => {
    const newDescription = newValue.trim();
    const { error } = await updateTable({
      id: table.id,
      description: newDescription.length > 0 ? newDescription : null,
    });
    if (error) {
      sendErrorToast(t`Failed to update table description`);
    } else {
      sendSuccessToast(t`Table description updated`);
    }
  };

  const handleDataSourceChange = async (
    dataSource: TableDataSource | "unknown" | null,
  ) => {
    if (dataSource == null) {
      return; // should never happen as the input is not clearable here
    }

    const { error } = await updateTable({
      id: table.id,
      data_source: dataSource === "unknown" ? null : dataSource,
    });

    if (error) {
      sendErrorToast(t`Failed to update table data source`);
    } else {
      sendSuccessToast(t`Table data source updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          data_source: table.data_source,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleEntityTypeChange = async (entityType: Table["entity_type"]) => {
    const { error } = await updateTable({
      id: table.id,
      entity_type: entityType,
    });

    if (error) {
      sendErrorToast(t`Failed to update entity type`);
    } else {
      sendSuccessToast(t`Entity type updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          entity_type: table.entity_type,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleOwnerEmailChange = async (email: string | null) => {
    const { error } = await updateTable({
      id: table.id,
      owner_email: email,
      owner_user_id: null,
    });

    if (error) {
      sendErrorToast(t`Failed to update table owner`);
    } else {
      sendSuccessToast(t`Table owner updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          owner_email: table.owner_email,
          owner_user_id: table.owner_user_id,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleOwnerUserIdChange = async (userId: UserId | "unknown" | null) => {
    if (userId == null) {
      return; // should never happen as the input is not clearable here
    }

    const { error } = await updateTable({
      id: table.id,
      owner_email: null,
      owner_user_id: userId === "unknown" ? null : userId,
    });

    if (error) {
      sendErrorToast(t`Failed to update table owner`);
    } else {
      sendSuccessToast(t`Table owner updated`, async () => {
        const { error } = await updateTable({
          id: table.id,
          owner_email: table.owner_email,
          owner_user_id: table.owner_user_id,
        });
        sendUndoToast(error);
      });
    }
  };

  const isOwnerSpecified = table.owner_email || table.owner_user_id;

  return (
    <Stack gap={0} align="stretch">
      {/* Entity Type Selector */}

      <Box className={S.contentSectionGridContainer} px="lg" py="md">
        <EntityTypeInput
          value={table.entity_type ?? "entity/GenericTable"}
          onChange={handleEntityTypeChange}
          classNames={{ input: TAS.input, label: TAS.label }}
          className={TAS.gridLabelInput}
        />
      </Box>

      <Divider />

      {/* Description */}
      <Box data-testid="table-description-section" p={rem(20)}>
        <EditableText
          initialValue={table.description ?? ""}
          placeholder={t`No description`}
          isMarkdown
          onChange={handleChange}
        />
      </Box>

      {/* Metadata Sections */}

      <Card mx="lg" bg="background-secondary" shadow="none">
        <Card.Section withBorder p="md">
          <Group gap="sm" mb={4}>
            <Icon name="refresh" size={20} color="brand" />
            <Text size="md" fw={600}>
              {formattedDate}
            </Text>
          </Group>
          <Text size="sm" color="text-medium" ml={28}>
            {t`Last update`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="md">
          <Group gap="sm" mb={4}>
            <Icon name="database" size={20} color="brand" />
            <Text size="md" fw={600}>
              {table.db?.name || "—"}
            </Text>
          </Group>
          <Text size="sm" color="text-medium" ml={28}>
            {t`Database`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="md">
          <Group gap="sm" mb={4}>
            <Icon name="table" size={20} color="brand" />

            <DataSourceInput
              disabled={table.data_source === "metabase-transform"}
              value={table.data_source ?? "unknown"}
              label={null}
              onChange={handleDataSourceChange}
            />
          </Group>
          <Text size="sm" color="text-medium" ml={28}>
            {t`Source`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="md">
          <Group gap="sm" mb={4}>
            <Icon name="person" size={20} color="brand" />

            <UserInput
              email={table.owner_email}
              userId={isOwnerSpecified ? table.owner_user_id : "unknown"}
              onEmailChange={handleOwnerEmailChange}
              onUserIdChange={handleOwnerUserIdChange}
              unknownUserLabel={t`No owner`}
              classNames={{
                input: cx(TAS.input, !isOwnerSpecified && TAS.unset),
                label: TAS.label,
              }}
            />
          </Group>
          <Text size="sm" color="text-medium" ml={28}>
            {t`Owner`}
          </Text>
        </Card.Section>
      </Card>

      {/* Statistics */}
      <Card mx="lg" my="lg" shadow="none">
        <Card.Section withBorder py={rem(12)} px="md">
          <Flex justify="space-between" align="center">
            <Text size="md" color="text-medium">
              {t`Fields`}
            </Text>
            <Text size="xl" fw={600}>
              {table.fields?.length ?? 0}
            </Text>
          </Flex>
        </Card.Section>

        {!isNullOrUndefined(table.estimated_row_count) && (
          <Card.Section withBorder py={rem(12)} px="md">
            <Flex justify="space-between" align="center">
              <Text size="md" color="text-medium">
                {t`Rows`}
              </Text>
              <Text size="xl" fw={600}>
                {formatNumber(table.estimated_row_count)}
              </Text>
            </Flex>
          </Card.Section>
        )}

        {isDependenciesEnabled && (
          <Card.Section withBorder py={rem(12)} px="md">
            <Flex justify="space-between" align="center">
              <Text size="md" color="text-medium">
                {t`Dependents`}
              </Text>
              <Text size="xl" fw={600}>
                {dependentsCount}
              </Text>
            </Flex>
          </Card.Section>
        )}
      </Card>
    </Stack>
  );
}
