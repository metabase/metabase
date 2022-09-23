import React, { useState } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";

import {
  OptionEditorContainer,
  AddMorePrompt,
  StyledTextArea,
} from "./OptionEditor.styled";

type ValueOptions = (string | number)[];

const optionsToText = (options: ValueOptions) => options.join("\n");
const textToOptions = (text: string): ValueOptions =>
  text.split("\n").map(option => option.trim());

export const OptionEditor = ({
  options,
  onChange,
}: {
  options: ValueOptions;
  onChange: (options: ValueOptions) => void;
}) => {
  const [text, setText] = useState(optionsToText(options));
  const save = () => {
    onChange(textToOptions(text));
  };

  return (
    <OptionEditorContainer>
      <StyledTextArea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={t`Enter one option per line`}
      />
      <AddMorePrompt style={{ opacity: text.length ? 1 : 0 }}>
        {t`Press enter to add another option`}
      </AddMorePrompt>
      <Button onClick={save} small>
        {t`Save`}
      </Button>
    </OptionEditorContainer>
  );
};
