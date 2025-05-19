import { useState } from "react";
import { t } from "ttag";

export type PreviewType = ReturnType<
  typeof getTypeSelectorData
>[number]["value"];

export function getTypeSelectorData() {
  return [
    { label: t`Table`, value: "table" as const },
    { label: t`Detail`, value: "detail" as const },
    { label: t`Filtering`, value: "filtering" as const },
  ];
}

export function usePreviewType() {
  return useState<PreviewType>("table");
}
