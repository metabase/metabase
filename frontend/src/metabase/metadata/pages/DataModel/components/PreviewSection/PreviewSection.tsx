import { useMemo } from "react";

import { Box, Card, Flex, SegmentedControl, Text } from "metabase/ui";
import type { DatabaseId, Field, FieldId, TableId } from "metabase-types/api";

import { ObjectDetailPreview } from "./ObjectDetail";
import { TablePreview } from "./TablePreview";
import { type PreviewType, getTypeSelectorData } from "./utils";

interface Props {
  databaseId: DatabaseId;
  tableId: TableId;
  fieldId: FieldId;
  field: Field;
  previewType: PreviewType;
  onPreviewTypeChange: (value: PreviewType) => void;
}

export const PreviewSection = ({
  databaseId,
  tableId,
  fieldId,
  field,
  previewType,
  onPreviewTypeChange,
}: Props) => {
  return (
    <Card bg="white" h="100%" px="lg" py="md" shadow="xs">
      <Text fw="bold">Field preview</Text>
      <PreviewTypeSelector value={previewType} onChange={onPreviewTypeChange} />

      {previewType === "table" && (
        <TablePreview
          databaseId={databaseId}
          tableId={tableId}
          fieldId={fieldId}
          field={field}
        />
      )}
      {previewType === "detail" && (
        <ObjectDetailPreview
          databaseId={databaseId}
          tableId={tableId}
          fieldId={fieldId}
        />
      )}
      {previewType === "filtering" && <Box>FILTERING</Box>}
    </Card>
  );
};

function PreviewTypeSelector({
  value,
  onChange,
}: {
  value: PreviewType;
  onChange: (value: PreviewType) => void;
}) {
  const data = useMemo(getTypeSelectorData, []);

  return (
    <Flex py="sm" w="100%">
      <SegmentedControl
        data={data}
        value={value}
        onChange={onChange}
        w="100%"
      />
    </Flex>
  );
}
