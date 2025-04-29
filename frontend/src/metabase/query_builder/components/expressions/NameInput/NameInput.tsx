import { type ChangeEvent, type KeyboardEvent, useCallback } from "react";

import { TextInput } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./NameInput.module.css";
import { getPlaceholder } from "./utils";

export function NameInput({
  value,
  onChange,
  onSubmit,
  expressionMode,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  expressionMode: Lib.ExpressionMode;
}) {
  const handleChange = useCallback(
    (evt: ChangeEvent<HTMLInputElement>) => {
      onChange(evt.target.value);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (evt: KeyboardEvent<HTMLInputElement>) => {
      if (evt.key === "Enter") {
        onSubmit();
      }
    },
    [onSubmit],
  );

  return (
    <TextInput
      id="expression-name"
      data-testid="expression-name"
      type="text"
      value={value}
      placeholder={getPlaceholder(expressionMode)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      classNames={{
        root: S.root,
        input: S.input,
      }}
    />
  );
}
