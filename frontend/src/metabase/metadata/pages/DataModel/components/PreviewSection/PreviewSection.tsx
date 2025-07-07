import { memo, useMemo } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Card,
  Flex,
  Group,
  Icon,
  SegmentedControl,
  Text,
} from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatabaseId,
  Field,
  FieldId,
  Table,
  TableId,
} from "metabase-types/api";

import { FilteringPreview } from "./FilteringPreview";
import { ObjectDetailPreview } from "./ObjectDetailPreview";
import S from "./PreviewSection.module.css";
import { TablePreview } from "./TablePreview";
import type { PreviewType } from "./types";
import { getPreviewTypeData } from "./utils";

interface Props {
  className?: string;
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  previewType: PreviewType;
  table: Table;
  tableId: TableId;
  onClose: () => void;
  onPreviewTypeChange: (value: PreviewType) => void;
}

const PreviewSectionBase = ({
  className,
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
  const pkFields = table.fields?.filter((field) => isPK(field)) ?? [];

  return (
    <Card
      bg="white"
      className={className}
      data-testid="preview-section"
      h="100%"
      px="lg"
      py="md"
      withBorder
    >
      <Group justify="space-between">
        <Text fw="bold">{t`Field preview`}</Text>

        <ActionIcon color="text-dark" variant="transparent" onClick={onClose}>
          <Icon name="close" />
        </ActionIcon>
      </Group>

      <Flex py="sm" w="100%">
        <SegmentedControl
          aria-label={t`Preview type`}
          data={data}
          value={previewType}
          w="100%"
          onChange={onPreviewTypeChange}
        />
      </Flex>

      <Box className={S.tabContent} h="100%">
        {previewType === "table" && (
          <TablePreview
            databaseId={databaseId}
            field={field}
            fieldId={fieldId}
            pkFields={pkFields}
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
      </Box>
    </Card>
  );
};

export const PreviewSection = memo(PreviewSectionBase);
