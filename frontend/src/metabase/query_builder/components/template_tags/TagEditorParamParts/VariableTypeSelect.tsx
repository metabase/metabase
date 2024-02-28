import { t } from "ttag";

import { Select } from "metabase/ui";
import type { TemplateTagType } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam.styled";

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
        data={[
          { value: "text", label: t`Text` },
          { value: "number", label: t`Number` },
          { value: "date", label: t`Date` },
          { value: "dimension", label: t`Field Filter` },
        ]}
        data-testid="variable-type-select"
      ></Select>
    </InputContainer>
  );
}
