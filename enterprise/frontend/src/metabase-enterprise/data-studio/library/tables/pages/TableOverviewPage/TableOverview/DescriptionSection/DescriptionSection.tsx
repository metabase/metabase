import cx from "classnames";
import type { MouseEvent, ReactNode } from "react";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { EditableText } from "metabase/common/components/EditableText";
import { Link } from "metabase/common/components/Link/Link";
import { useMetadataToasts } from "metabase/common/hooks";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { DataSourceInput, UserInput } from "metabase/metadata/components";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Box, Card, Flex, Group, Icon, Stack, Text, rem } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isNullOrUndefined } from "metabase/utils/types";
import type {
  IconName,
  Table,
  TableDataSource,
  UserId,
} from "metabase-types/api";

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

      {/* Who owns it, when it last changed, where it lives, and where it
          comes from */}
      <Card mx="xl" bg="background_page-secondary" shadow="none" radius="1rem">
        <OverviewProperty
          icon="person"
          isSet={Boolean(isOwnerSpecified)}
          label={t`Owner`}
          isPicker
        >
          <UserInput
            email={table.owner_email}
            userId={isOwnerSpecified ? table.owner_user_id : "unknown"}
            onEmailChange={handleOwnerEmailChange}
            onUserIdChange={handleOwnerUserIdChange}
            unknownUserLabel={t`No owner`}
            classNames={{
              root: S.textStyleWrapper,
              input: cx(S.textStyleInput, isOwnerSpecified && S.selectedInput),
              section: S.textStyleSection,
            }}
          />
        </OverviewProperty>
        <OverviewProperty icon="pencil" isSet label={t`Last edited at`}>
          <Text size="md" fw={600} lh="1rem">
            <DateTime value={table.updated_at} />
          </Text>
        </OverviewProperty>
        <OverviewProperty icon="database" isSet label={t`Location`}>
          <TableLocation table={table} />
        </OverviewProperty>
        <OverviewProperty
          icon="refresh_downstream"
          isSet={table.data_source != null}
          label={t`Source`}
          isPicker={table.data_source !== "metabase-transform"}
        >
          <DataSourceInput
            disabled={table.data_source === "metabase-transform"}
            value={table.data_source ?? "unknown"}
            label={null}
            classNames={{
              root: S.textStyleWrapper,
              input: cx(S.textStyleInput, table.data_source && S.selectedInput),
              section: S.textStyleSection,
            }}
            showUnknown={!table.data_source}
            onChange={handleDataSourceChange}
          />
        </OverviewProperty>
        {table.data_source === "metabase-transform" && (
          <OverviewProperty icon="insight" isSet label={t`Transform`}>
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
          </OverviewProperty>
        )}
      </Card>

      {/* Size, then usage */}
      <Card mx="xl" my="xl" shadow="none">
        {!isNullOrUndefined(table.estimated_row_count) && (
          <OverviewCount
            label={t`Rows`}
            value={formatNumber(table.estimated_row_count)}
          />
        )}
        <OverviewCount
          label={t`Fields`}
          value={table.fields?.length ?? 0}
          to={Urls.dataStudioTableFields(table.id)}
        />
        <OverviewCount
          label={t`Views`}
          value={formatNumber(table.view_count)}
        />
        {isDependenciesEnabled && (
          <OverviewCount
            label={t`Dependents`}
            value={dependentsCount}
            to={
              dependentsCount > 0
                ? Urls.dataStudioTableDependencies(table.id)
                : undefined
            }
          />
        )}
        {isDependenciesEnabled && (
          <OverviewCount
            label={t`Dependencies`}
            value={dependenciesCount}
            to={
              dependenciesCount > 0
                ? Urls.dataStudioTableDependencies(table.id)
                : undefined
            }
          />
        )}
      </Card>
    </Stack>
  );
}

/** One property of the table: its value with an icon, and a label under it */
function OverviewProperty({
  icon,
  isSet,
  label,
  isPicker = false,
  children,
}: {
  icon: IconName;
  /** Unset properties get a muted icon */
  isSet: boolean;
  label: string;
  /** The value is a picker; clicking anywhere in the row opens it */
  isPicker?: boolean;
  children: ReactNode;
}) {
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const { currentTarget, target } = event;
    // Clicks in the picker's own dropdown are portaled outside the row, and
    // clicks on the picker itself (its input and chevron) already open it
    if (
      !(target instanceof Node) ||
      !currentTarget.contains(target) ||
      (target instanceof Element && target.closest(`.${S.textStyleWrapper}`))
    ) {
      return;
    }
    const input = currentTarget.querySelector("input");
    input?.focus();
    input?.click();
  };

  return (
    <Card.Section
      withBorder
      p="lg"
      className={isPicker ? S.pickerProperty : undefined}
      onClick={isPicker ? handleClick : undefined}
    >
      <Group gap="sm" mb={4} wrap="nowrap" align="flex-start">
        <Icon
          name={icon}
          c={isSet ? "core-brand" : "icon-disabled"}
          flex="0 0 auto"
        />
        {/* Fills the row, so a picker's chevron sits at the right edge */}
        <Box flex={1} miw={0}>
          {children}
        </Box>
      </Group>
      <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
        {label}
      </Text>
    </Card.Section>
  );
}

/** Database › schema › the table's name in the database */
function TableLocation({ table }: { table: Table }) {
  return (
    <Group gap="xs" wrap="wrap">
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
      {table.schema && (
        <>
          <Text c="text-secondary" lh="1rem">
            ›
          </Text>
          <Text size="md" fw={600} lh="1rem" ff="monospace">
            {table.schema}
          </Text>
        </>
      )}
      <Text c="text-secondary" lh="1rem">
        ›
      </Text>
      <Text size="md" fw={600} lh="1rem" ff="monospace">
        {table.name}
      </Text>
    </Group>
  );
}

/** A count, linking somewhere when there's a page for it */
function OverviewCount({
  label,
  value,
  to,
}: {
  label: string;
  value: ReactNode;
  to?: string;
}) {
  const valueText = (
    <Text size="xl" fw={600}>
      {value}
    </Text>
  );
  return (
    <Card.Section withBorder py={rem(12)} px="lg">
      <Flex justify="space-between" align="center">
        <Text size="md" c="text-secondary">
          {label}
        </Text>
        {to ? (
          <Link to={to} className={S.metricLink}>
            {valueText}
          </Link>
        ) : (
          valueText
        )}
      </Flex>
    </Card.Section>
  );
}
