import { memo, useMemo } from "react";
import { t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
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
import type { Field, Table } from "metabase-types/api";

import { FilteringPreview } from "./FilteringPreview";
import { ObjectDetailPreview } from "./ObjectDetailPreview";
import S from "./PreviewSection.module.css";
import { TablePreview } from "./TablePreview";
import type { PreviewType } from "./types";
import { getPreviewTypeData } from "./utils";

type PreviewSectionBaseProps = {
  className?: string;
  field: Field;
  table: Table;
  previewType: PreviewType;
  onPreviewTypeChange: (value: PreviewType) => void;
  onClose: () => void;
};

const PreviewSectionBase = ({
  className,
  field,
  table,
  previewType,
  onPreviewTypeChange,
  onClose,
}: PreviewSectionBaseProps) => {
  const fieldId = getRawTableFieldId(field);
  const tableId = table.id;
  const databaseId = table.db_id;
  const data = useMemo(() => getPreviewTypeData(), []);
  const pkFields = useMemo(
    () => table.fields?.filter((field) => isPK(field)) ?? [],
    [table.fields],
  );

  return (
    <Card
      className={className}
      data-testid="preview-section"
      h="100%"
      px="lg"
      py="md"
      withBorder
    >
      <Group justify="space-between">
        <Text fw="bold">{t`Field preview`}</Text>

        <ActionIcon
          color="text-primary"
          variant="transparent"
          onClick={onClose}
        >
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
            field={field}
            fieldId={fieldId}
            key={getFilteringPreviewKey(field)}
            table={table}
          />
        )}
      </Box>
    </Card>
  );
};

function getFilteringPreviewKey(field: Field) {
  return [
    field.id,
    field.base_type,
    field.effective_type,
    field.semantic_type,
    field.fk_target_field_id,
    field.visibility_type,
    field.has_field_values,
  ].join(":");
}

export const PreviewSection = memo(PreviewSectionBase);
