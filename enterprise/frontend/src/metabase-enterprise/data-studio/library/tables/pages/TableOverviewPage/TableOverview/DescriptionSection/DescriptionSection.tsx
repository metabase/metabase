import cx from "classnames";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { EditableText } from "metabase/common/components/EditableText";
import { Link } from "metabase/common/components/Link/Link";
import { useMetadataToasts } from "metabase/common/hooks";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { DataSourceInput, UserInput } from "metabase/metadata/components";
import {
  DATA_LAYER_VISIBILITY_ICONS,
  useDataLayers,
} from "metabase/metadata/data-layers";
import {
  getRowIdentityLabel,
  getTableHiddenReason,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Box, Card, Flex, Group, Icon, Stack, Text, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isNullOrUndefined } from "metabase/utils/types";
import type { Table, TableDataSource, UserId } from "metabase-types/api";

import { PublishingInfo } from "../PublishingInfo";

import S from "./DescriptionSection.module.css";

type DescriptionSectionProps = {
  table: Table;
};

export function DescriptionSection({ table }: DescriptionSectionProps) {
  const [updateTable] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const formatNumber = useNumberFormatter();
  const isDependenciesEnabled = PLUGIN_DEPENDENCIES.isEnabled;

  const { dependenciesCount, dependentsCount } =
    PLUGIN_DEPENDENCIES.useGetDependenciesCount({
      id: Number(table.id),
      type: "table",
    });
  // PROTOTYPE: mocked. Data layers live in the prototype's browser storage.
  const { getTableDataLayer } = useDataLayers();
  const dataLayer = getTableDataLayer(
    table.db_id,
    table.schema,
    table.id,
  ).layer;
  const structure = useTableStructures().getTableStructure(table);
  const hiddenReason = getTableHiddenReason({
    table,
    role: structure.role,
    dataLayer,
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
    <Stack gap={0} align="stretch" data-testid="table-description-sidebar">
      {/* Description */}
      <Box data-testid="table-description-section" p={rem(20)}>
        <EditableText
          initialValue={table.description ?? ""}
          placeholder={t`No description`}
          isMarkdown
          isOptional
          isMultiline
          onChange={handleChange}
        />
      </Box>

      {/* Metadata Sections */}
      <Card mx="xl" bg="background_page-secondary" shadow="none" radius="1rem">
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4}>
            <Icon name="pencil" c="core-brand" />
            <Text size="md" fw={600} lh="1rem">
              <DateTime value={table.updated_at} />
            </Text>
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {t`Last edited at`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4}>
            <Icon name="database" c="core-brand" />
            {table.db ? (
              <Link to={Urls.dataStudioData({ databaseId: table.db.id })}>
                <Text size="md" fw={600} lh="1rem">
                  {table.db.name}
                </Text>
              </Link>
            ) : (
              <Text size="md" fw={600} lh="1rem">
                —
              </Text>
            )}
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {t`Database`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4} wrap="nowrap">
            <Icon name="table" c="core-brand" />
            <Text size="md" fw={600} lh="1rem" ff="monospace" truncate>
              {table.name}
            </Text>
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {t`Raw name`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4} wrap="nowrap">
            <Icon
              name={
                dataLayer
                  ? DATA_LAYER_VISIBILITY_ICONS[dataLayer.visibility]
                  : "database"
              }
              c={dataLayer ? "core-brand" : "icon-disabled"}
            />
            <Text size="md" fw={600} lh="1rem">
              {dataLayer?.name ?? t`No data layer`}
            </Text>
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {t`Data layer`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4} wrap="nowrap">
            <Icon name="key" c="core-brand" />
            <Text size="md" fw={600} lh="1rem">
              {getRowIdentityLabel(structure.rowIdentity)}
            </Text>
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {t`Row identity`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4} wrap="nowrap" align="flex-start">
            <Icon
              name={hiddenReason ? "eye_crossed_out" : "eye"}
              c={hiddenReason ? "icon-disabled" : "core-brand"}
            />
            <Text size="md" fw={600} lh="1.25rem">
              {hiddenReason
                ? t`Hidden: ${hiddenReason}`
                : t`Shown to people who can see its data layer`}
            </Text>
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {t`Visibility`}
          </Text>
        </Card.Section>
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4}>
            <Icon
              name="refresh_downstream"
              c={table.data_source ? "core-brand" : "icon-disabled"}
            />

            <DataSourceInput
              disabled={table.data_source === "metabase-transform"}
              value={table.data_source ?? "unknown"}
              label={null}
              classNames={{
                root: S.textStyleWrapper,
                input: cx(
                  S.textStyleInput,
                  table.data_source && S.selectedInput,
                ),
                section: S.textStyleSection,
              }}
              showUnknown={!table.data_source}
              onChange={handleDataSourceChange}
            />
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {t`Source`}
          </Text>
        </Card.Section>
        {table.data_source === "metabase-transform" && (
          <Card.Section withBorder p="lg">
            <Group gap="sm" mb={4} wrap="nowrap">
              <Icon name="insight" c="core-brand" />
              {table.transform ? (
                <Link to={Urls.transform(table.transform.id)}>
                  <Text size="md" fw={600} lh="1rem">
                    {table.transform.name}
                  </Text>
                </Link>
              ) : (
                <Text size="md" fw={600} lh="1rem" c="feedback-negative">
                  {t`Transform does not exist anymore`}
                </Text>
              )}
            </Group>
            <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
              {t`Transform`}
            </Text>
          </Card.Section>
        )}
        <Card.Section withBorder p="lg">
          <Group gap="sm" mb={4}>
            <Icon
              name="person"
              c={isOwnerSpecified ? "core-brand" : "icon-disabled"}
            />

            <UserInput
              email={table.owner_email}
              userId={isOwnerSpecified ? table.owner_user_id : "unknown"}
              onEmailChange={handleOwnerEmailChange}
              onUserIdChange={handleOwnerUserIdChange}
              unknownUserLabel={t`No owner`}
              classNames={{
                root: S.textStyleWrapper,
                input: cx(
                  S.textStyleInput,
                  isOwnerSpecified && S.selectedInput,
                ),
                section: S.textStyleSection,
              }}
            />
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {t`Owner`}
          </Text>
        </Card.Section>
        <PublishingInfo table={table} />
      </Card>

      {/* Statistics */}
      <Card mx="xl" my="xl" shadow="none">
        <Card.Section withBorder py={rem(12)} px="lg">
          <Flex justify="space-between" align="center">
            <Text size="md" c="text-secondary">
              {t`Fields`}
            </Text>
            <Link
              to={Urls.dataStudioTableFields(table.id)}
              className={S.metricLink}
            >
              <Text size="xl" fw={600}>
                {table.fields?.length ?? 0}
              </Text>
            </Link>
          </Flex>
        </Card.Section>

        {!isNullOrUndefined(table.estimated_row_count) && (
          <Card.Section withBorder py={rem(12)} px="lg">
            <Flex justify="space-between" align="center">
              <Text size="md" c="text-secondary">
                {t`Rows`}
              </Text>
              <Text size="xl" fw={600}>
                {formatNumber(table.estimated_row_count)}
              </Text>
            </Flex>
          </Card.Section>
        )}

        <Card.Section withBorder py={rem(12)} px="lg">
          <Flex justify="space-between" align="center">
            <Text size="md" c="text-secondary">
              {t`Views`}
            </Text>
            <Text size="xl" fw={600}>
              {formatNumber(table.view_count)}
            </Text>
          </Flex>
        </Card.Section>

        {isDependenciesEnabled && (
          <Card.Section withBorder py={rem(12)} px="lg">
            <Flex justify="space-between" align="center">
              <Text size="md" c="text-secondary">
                {t`Dependencies`}
              </Text>
              {dependenciesCount > 0 ? (
                <Link
                  to={Urls.dataStudioTableDependencies(table.id)}
                  className={S.metricLink}
                >
                  <Text size="xl" fw={600}>
                    {dependenciesCount}
                  </Text>
                </Link>
              ) : (
                <Text size="xl" fw={600}>
                  {dependenciesCount}
                </Text>
              )}
            </Flex>
          </Card.Section>
        )}

        {isDependenciesEnabled && (
          <Card.Section withBorder py={rem(12)} px="lg">
            <Flex justify="space-between" align="center">
              <Text size="md" c="text-secondary">
                {t`Dependents`}
              </Text>

              {dependentsCount > 0 ? (
                <Link
                  to={Urls.dataStudioTableDependencies(table.id)}
                  className={S.metricLink}
                >
                  <Text size="xl" fw={600}>
                    {dependentsCount}
                  </Text>
                </Link>
              ) : (
                <Text size="xl" fw={600}>
                  {dependentsCount}
                </Text>
              )}
            </Flex>
          </Card.Section>
        )}
      </Card>
    </Stack>
  );
}
