import { useMemo, useState } from "react";
import { t } from "ttag";

import { Card, Flex, SegmentedControl, Text } from "metabase/ui";
import type { DatabaseId, Field, FieldId, TableId } from "metabase-types/api";

import { ObjectDetailPreview } from "./ObjectDetail";
import { TablePreview } from "./TablePreview";

interface Props {
  databaseId: DatabaseId;
  tableId: TableId;
  fieldId: FieldId;
  field: Field;
  previewType: PreviewType;
  onPreviewTypeChange: (value: PreviewType) => void;
}

type PreviewType = ReturnType<typeof getTypeSelectorData>[number]["value"];

export const PreviewSection = (props: Props) => {
  const { previewType, onPreviewTypeChange } = props;
  return (
    <Card bg="white" h="100%" px="lg" py="md" shadow="xs">
      <Text fw="bold">Field preview</Text>
      <PreviewTypeSelector value={previewType} onChange={onPreviewTypeChange} />

      {previewType === "table" && <TablePreview {...props} />}
      {previewType === "detail" && <ObjectDetailPreview {...props} />}
    </Card>
  );
};

export function usePreviewType() {
  return useState<PreviewType>("table");
}

function getTypeSelectorData() {
  return [
    { label: t`Table`, value: "table" as const },
    { label: t`Detail`, value: "detail" as const },
    { label: t`Filtering`, value: "filtering" as const },
  ];
}

function PreviewTypeSelector({
  value,
  onChange,
}: {
  value: PreviewType;
  onChange: (value: PreviewType) => void;
}) {
  const data = useMemo(getTypeSelectorData, []);

  return (
    <Flex py="sm">
      <SegmentedControl
        data={data}
        value={value}
        onChange={onChange}
        w="100%"
      />
    </Flex>
  );
}
