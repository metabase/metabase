import { useMemo } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Card,
  Flex,
  Group,
  Icon,
  SegmentedControl,
  Text,
} from "metabase/ui";
import type {
  DatabaseId,
  Field,
  FieldId,
  Table,
  TableId,
} from "metabase-types/api";

import { FilteringPreview } from "./FilteringPreview";
import { ObjectDetailPreview } from "./ObjectDetailPreview";
import { TablePreview } from "./TablePreview";
import type { PreviewType } from "./types";
import { getPreviewTypeData } from "./utils";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  previewType: PreviewType;
  table: Table;
  tableId: TableId;
  onClose: () => void;
  onPreviewTypeChange: (value: PreviewType) => void;
}

export const PreviewSection = ({
  databaseId,
  field,
  fieldId,
  previewType,
  table,
  tableId,
  onClose,
  onPreviewTypeChange,
}: Props) => {
  const data = useMemo(() => getPreviewTypeData(), []);

  return (
    <Card bg="white" h="100%" px="lg" py="md" shadow="xs">
      <Group justify="space-between">
        <Text fw="bold">{t`Field preview`}</Text>

        <ActionIcon color="text-dark" variant="transparent" onClick={onClose}>
          <Icon name="close" />
        </ActionIcon>
      </Group>

      <Flex py="sm" w="100%">
        <SegmentedControl
          data={data}
          value={previewType}
          w="100%"
          onChange={onPreviewTypeChange}
        />
      </Flex>

      {previewType === "table" && (
        <TablePreview
          databaseId={databaseId}
          field={field}
          fieldId={fieldId}
          tableId={tableId}
        />
      )}

      {previewType === "detail" && (
        <ObjectDetailPreview
          databaseId={databaseId}
          field={field}
          fieldId={fieldId}
          tableId={tableId}
        />
      )}

      {previewType === "filtering" && (
        <FilteringPreview
          databaseId={databaseId}
          fieldId={fieldId}
          /**
           * Make sure internal component state is reset when changing any field settings.
           * This is because use***Filter hooks cache some parts of state internally on mount
           * and do not account for all prop changes during their lifecycle.
           */
          key={JSON.stringify(field)}
          table={table}
        />
      )}
    </Card>
  );
};
