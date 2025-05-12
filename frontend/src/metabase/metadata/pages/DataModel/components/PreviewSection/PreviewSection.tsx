import { useMemo, useState } from "react";
import { t } from "ttag";

import { Card, SegmentedControl, Text } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

import { TablePreview } from "./TablePreview";

interface Props {
  fieldId: FieldId;
}

type PreviewType = ReturnType<typeof getTypeSelectorData>[number]["value"];

export const PreviewSection = (props: Props) => {
  const [previewType, setPreviewType] = useState<PreviewType>("table");

  return (
    <Card bg="white" h="100%" px="lg" py="md" shadow="xs">
      <Text fw="bold">Field preview</Text>
      <PreviewTypeSelector value={previewType} onChange={setPreviewType} />

      {previewType === "table" && <TablePreview {...props} />}
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

function PreviewTypeSelector({
  value,
  onChange,
}: {
  value: PreviewType;
  onChange: (value: PreviewType) => void;
}) {
  const data = useMemo(getTypeSelectorData, []);

  return <SegmentedControl data={data} value={value} onChange={onChange} />;
}
