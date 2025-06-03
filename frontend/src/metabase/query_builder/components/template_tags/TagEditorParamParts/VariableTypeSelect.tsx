import { t } from "ttag";

import { Select } from "metabase/ui";
import type { TemplateTagType } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

const OPTIONS: Array<{ value: TemplateTagType; label: string }> = [
  {
    value: "text",
    get label() {
      return t`Text`;
    },
  },
  {
    value: "number",
    get label() {
      return t`Number`;
    },
  },
  {
    value: "date",
    get label() {
      return t`Date`;
    },
  },
  {
    value: "dimension",
    get label() {
      return t`Field Filter`;
    },
  },
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
