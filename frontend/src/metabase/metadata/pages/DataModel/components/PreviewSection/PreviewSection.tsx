import { useMemo } from "react";
import { t } from "ttag";

import { Box, Card, Flex, SegmentedControl, Text } from "metabase/ui";
import type { DatabaseId, Field, FieldId, TableId } from "metabase-types/api";

import { ObjectDetailPreview } from "./ObjectDetailPreview";
import { TablePreview } from "./TablePreview";
import type { PreviewType } from "./types";
import { getPreviewTypeData } from "./utils";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  previewType: PreviewType;
  tableId: TableId;
  onPreviewTypeChange: (value: PreviewType) => void;
}

export const PreviewSection = ({
  databaseId,
  field,
  fieldId,
  previewType,
  tableId,
  onPreviewTypeChange,
}: Props) => {
  const data = useMemo(() => getPreviewTypeData(), []);

  return (
    <Card bg="white" h="100%" px="lg" py="md" shadow="xs">
      <Text fw="bold">{t`Field preview`}</Text>

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

      {previewType === "filtering" && <Box>FILTERING</Box>}
    </Card>
  );
};
