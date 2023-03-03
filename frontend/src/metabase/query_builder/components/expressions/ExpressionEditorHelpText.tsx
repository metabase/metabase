import React from "react";
import { t } from "ttag";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import { HelpText } from "metabase-lib/expressions/types";
import {
  Container,
  ExampleBlock,
  ExampleCode,
  ExampleTitleText,
  FunctionHelpCode,
} from "./ExpressionEditorHelpText.styled";

interface ExpressionEditorHelpTextProps {
  helpText: HelpText;
  width: number;
  target: Element;
}

const ExpressionEditorHelpText = ({
  helpText,
  width,
  target,
}: ExpressionEditorHelpTextProps) => {
  if (!helpText) {
    return null;
  }

  return (
    <TippyPopover
      maxWidth={width}
      reference={target}
      placement="bottom-start"
      visible
      content={
        <>
          {/* Prevent stealing focus from input box causing the help text to be closed (metabase#17548) */}
          <Container onMouseDown={e => e.preventDefault()}>
            <div>{helpText.description}</div>
            <FunctionHelpCode>{helpText.structure}</FunctionHelpCode>
            <ExampleBlock>
              <ExampleTitleText>{t`Example`}</ExampleTitleText>
              <ExampleCode>{helpText.example}</ExampleCode>
            </ExampleBlock>
          </Container>
        </>
      }
    />
  );
};

export default ExpressionEditorHelpText;
