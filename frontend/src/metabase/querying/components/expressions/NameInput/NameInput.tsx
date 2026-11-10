import {
  type ChangeEvent,
  type KeyboardEvent,
  type Ref,
  useCallback,
} from "react";

import { TextInput } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./NameInput.module.css";
import { getPlaceholder } from "./utils";

export function NameInput({
  value,
  onChange,
  onSubmit,
  expressionMode,
  readOnly,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  expressionMode: Lib.ExpressionMode;
  readOnly?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const handleChange = useCallback(
    (evt: ChangeEvent<HTMLInputElement>) => {
      onChange(evt.target.value);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (evt: KeyboardEvent<HTMLInputElement>) => {
      if (evt.nativeEvent.isComposing) {
        return;
      }
      if (evt.key === "Enter") {
        onSubmit();
      }
    },
    [onSubmit],
  );

  return (
    <TextInput
      ref={inputRef}
      id="expression-name"
      data-testid="expression-name"
      type="text"
      value={value}
      placeholder={getPlaceholder(expressionMode)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      readOnly={readOnly}
      classNames={{
        root: S.root,
        input: S.input,
      }}
    />
  );
}
