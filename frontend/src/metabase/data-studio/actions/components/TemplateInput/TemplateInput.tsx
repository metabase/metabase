import { EditorView } from "@codemirror/view";
import { useMemo } from "react";

import { CodeMirror } from "metabase/common/components/CodeMirror";
import { Input } from "metabase/ui";

import S from "./TemplateInput.module.css";
import { singleLine, templateVariables } from "./extensions";

type TemplateInputProps = {
  value: string;
  placeholder?: string;
  "aria-label": string;
  readOnly?: boolean;
  onChange: (value: string) => void;
};

export function TemplateInput({
  value,
  placeholder,
  "aria-label": ariaLabel,
  readOnly = false,
  onChange,
}: TemplateInputProps) {
  const extensions = useMemo(
    () => [
      singleLine(),
      templateVariables(),
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
    ],
    [ariaLabel],
  );

  return (
    <Input component="div" className={S.input}>
      <CodeMirror
        value={value}
        placeholder={placeholder}
        basicSetup={false}
        extensions={extensions}
        aria-label={ariaLabel}
        editable={!readOnly}
        readOnly={readOnly}
        onChange={onChange}
      />
    </Input>
  );
}
