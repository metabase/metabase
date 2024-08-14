import { t } from "ttag";

import { Select } from "metabase/ui";
import type { TemplateTagType } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam.styled";

const OPTIONS: Array<{ value: TemplateTagType; label: string }> = [
  { value: "text", label: t`Text` },
  { value: "number", label: t`Number` },
  { value: "date", label: t`Date` },
  { value: "dimension", label: t`Field Filter` },
];

export function VariableTypeSelect(props: {
  value: TemplateTagType;
  onChange: (value: TemplateTagType) => void;
}) {
  return (
    <InputContainer>
      <ContainerLabel>{t`Variable type`}</ContainerLabel>
      <Select
        value={props.value}
        placeholder={t`Select…`}
        onChange={props.onChange}
        data={OPTIONS}
        data-testid="variable-type-select"
      ></Select>
    </InputContainer>
  );
}
