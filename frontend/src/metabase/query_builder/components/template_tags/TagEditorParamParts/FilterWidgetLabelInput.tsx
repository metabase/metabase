import { t } from "ttag";

import { TextInputBlurChange } from "metabase/ui";
import type { TemplateTag } from "metabase-types/api";

import {
  ContainerLabel,
  ErrorSpan,
  InputContainer,
} from "./TagEditorParam.styled";

export function FilterWidgetLabelInput({
  tag,
  onChange,
}: {
  tag: TemplateTag;
  onChange: (value: string) => void;
}) {
  return (
    <InputContainer>
      <ContainerLabel>
        {t`Filter widget label`}
        {!tag["display-name"] && <ErrorSpan>({t`required`})</ErrorSpan>}
      </ContainerLabel>
      <TextInputBlurChange
        id={`tag-editor-display-name_${tag.id}`}
        value={tag["display-name"]}
        onBlurChange={e => onChange(e.target.value)}
      />
    </InputContainer>
  );
}
