import React, { useState } from "react";
import { t } from "ttag";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";

import {
  OptionEditorContainer,
  AddMorePrompt,
  TextArea,
} from "./OptionEditor.styled";

type ValueOptions = (string | number)[];

const optionsToText = (options: ValueOptions) => options.join("\n");
const textToOptions = (text: string): ValueOptions =>
  text.split("\n").map(option => option.trim());

export const OptionPopover = ({
  options,
  onChange,
}: {
  options: ValueOptions;
  onChange: (options: ValueOptions) => void;
}) => {
  const [text, setText] = useState(optionsToText(options));
  const save = (closePopover: () => void) => {
    onChange(textToOptions(text));
    closePopover();
  };

  return (
    <TippyPopoverWithTrigger
      placement="bottom-end"
      triggerContent={
        <Icon name="list" size={14} tooltip={t`Change options`} />
      }
      maxWidth={400}
      popoverContent={({ closePopover }) => (
        <OptionEditorContainer>
          <TextArea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t`Enter one option per line`}
          />
          <AddMorePrompt style={{ opacity: text.length ? 1 : 0 }}>
            {t`Press enter to add another option`}
          </AddMorePrompt>
          <Button onClick={() => save(closePopover)} small>
            {t`Save`}
          </Button>
        </OptionEditorContainer>
      )}
    />
  );
};
