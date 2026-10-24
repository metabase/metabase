import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import type { OmniPickerTableItem } from "metabase/common/components/Pickers";
import {
  TablePath,
  TablePathItem,
} from "metabase/common/data-studio/components/TablePath";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import {
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ImplicitActionKind, Table, TableId } from "metabase-types/api";

import {
  getImplicitActionKindOption,
  getImplicitActionKindOptions,
  hasSinglePrimaryKey,
} from "../../utils";
import { ImplicitActionTablePickerModal } from "../ImplicitActionTablePickerModal";

type ImplicitActionDefinitionContentProps = {
  tableId: TableId | null;
  kind: ImplicitActionKind;
  readOnly?: boolean;
  onChangeTable: (tableId: TableId) => void;
  onChangeKind: (kind: ImplicitActionKind) => void;
};

export function ImplicitActionDefinitionContent({
  tableId,
  kind,
  readOnly = false,
  onChangeTable,
  onChangeKind,
}: ImplicitActionDefinitionContentProps) {
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();
  const {
    currentData: table,
    isFetching,
    error,
  } = useGetTableQueryMetadataQuery(
    tableId != null ? { id: tableId } : skipToken,
  );
  const kindOptions = getImplicitActionKindOptions().map(
    ({ value, label }) => ({ value, label }),
  );

  const handleKindChange = (value: string) => {
    const option = kindOptions.find((option) => option.value === value);
    if (option != null) {
      onChangeKind(option.value);
    }
  };

  const handleTableChange = (table: OmniPickerTableItem) => {
    closePicker();
    onChangeTable(table.id);
  };

  return (
    <Stack gap="2.5rem" data-testid="implicit-action-definition">
      <TitleSection
        label={t`Table`}
        description={t`The table this action writes to.`}
      >
        <Group p="xl" justify="space-between" wrap="nowrap">
          <ImplicitActionTableInfo
            table={table}
            isLoading={table == null && isFetching}
            error={error}
          />
          {!readOnly && <Button onClick={openPicker}>{t`Change table`}</Button>}
        </Group>
        {table != null && !hasSinglePrimaryKey(table) && (
          <Text c="feedback-negative" px="xl" pb="xl">
            {t`Actions can only write to a table with exactly one primary key.`}
          </Text>
        )}
      </TitleSection>
      <TitleSection
        label={t`Operation`}
        description={t`What the action does with one row of the table.`}
      >
        <Stack p="xl" gap="md" align="flex-start">
          <SegmentedControl
            value={kind}
            data={kindOptions}
            disabled={readOnly}
            onChange={handleKindChange}
          />
          <Text c="text-secondary">
            {getImplicitActionKindOption(kind).description}
          </Text>
        </Stack>
      </TitleSection>
      {isPickerOpened && (
        <ImplicitActionTablePickerModal
          tableId={tableId ?? undefined}
          onChange={handleTableChange}
          onClose={closePicker}
        />
      )}
    </Stack>
  );
}

type ImplicitActionTableInfoProps = {
  table: Table | undefined;
  isLoading: boolean;
  error: unknown;
};

function ImplicitActionTableInfo({
  table,
  isLoading,
  error,
}: ImplicitActionTableInfoProps) {
  if (isLoading) {
    return <Loader size="sm" />;
  }
  if (error != null) {
    return <Text c="feedback-negative">{getErrorMessage(error)}</Text>;
  }
  return <ImplicitActionTablePath table={table} />;
}

type ImplicitActionTablePathProps = {
  table: Table | undefined;
};

function ImplicitActionTablePath({ table }: ImplicitActionTablePathProps) {
  if (table == null) {
    return <Text c="text-secondary">{t`No table`}</Text>;
  }

  return (
    <TablePath>
      {table.db != null && (
        <TablePathItem
          label={table.db.name}
          icon="database"
          to={Urls.dataStudioData({ databaseId: table.db_id })}
        />
      )}
      {table.schema && (
        <TablePathItem
          label={table.schema}
          icon="folder"
          to={Urls.dataStudioData({
            databaseId: table.db_id,
            schemaName: table.schema,
          })}
        />
      )}
      <TablePathItem
        label={table.display_name}
        icon="table2"
        to={Urls.dataStudioData({
          databaseId: table.db_id,
          schemaName: table.schema,
          tableId: table.id,
        })}
      />
    </TablePath>
  );
}
