import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Card, Flex, SegmentedControl, Text } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

export type PreviewType = ReturnType<
  typeof getTypeSelectorData
>[number]["value"];

interface Props {
  fieldId?: FieldId;
  previewType: PreviewType;
  onPreviewTypeChange: (value: PreviewType) => void;
}

export const PreviewSection = ({ previewType, onPreviewTypeChange }: Props) => {
  return (
    <Card bg="white" h="100%" px="lg" py="md" shadow="xs">
      <Text fw="bold">Field preview</Text>
      <PreviewTypeSelector value={previewType} onChange={onPreviewTypeChange} />

      {previewType === "table" && <Box>TABLE</Box>}
      {previewType === "detail" && <Box>DETAIL</Box>}
      {previewType === "filtering" && <Box>FILTERING</Box>}
    </Card>
  );
};

function getTypeSelectorData() {
  return [
    { label: t`Table`, value: "table" as const },
    { label: t`Detail`, value: "detail" as const },
    { label: t`Filtering`, value: "filtering" as const },
  ];
}

export function usePreviewType() {
  return useState<PreviewType>("table");
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
