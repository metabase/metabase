import React from "react";
import { t } from "ttag";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Tooltip from "metabase/core/components/Tooltip";
import { HelpText } from "metabase-lib/expressions/types";
import {
  Container,
  ExampleBlock,
  ExampleCode,
  ExampleTitleText,
  FunctionHelpCode,
  FunctionHelpCodeArgument,
} from "./ExpressionEditorHelpText.styled";

export interface ExpressionEditorHelpTextProps {
  helpText: HelpText | null | undefined;
  width: number | undefined;
  target: React.RefObject<HTMLElement>;
}

const ExpressionEditorHelpText = ({
  helpText,
  width,
  target,
}: ExpressionEditorHelpTextProps) => {
  if (!helpText) {
    return null;
  }

  const { description, structure, args } = helpText;

  return (
    <TippyPopover
      maxWidth={width}
      reference={target}
      placement="bottom-start"
      visible
      content={
        <>
          {/* Prevent stealing focus from input box causing the help text to be closed (metabase#17548) */}
          <Container
            onMouseDown={e => e.preventDefault()}
            data-testid="expression-helper-popover"
          >
            <div>{description}</div>
            <FunctionHelpCode data-testid="expression-helper-popover-arguments">
              {structure}
              {args != null && (
                <>
                  (
                  {args.map(({ name, description }, index) => (
                    <span key={name}>
                      <Tooltip tooltip={description} placement="bottom-start">
                        <FunctionHelpCodeArgument>
                          {name}
                        </FunctionHelpCodeArgument>
                      </Tooltip>
                      {index + 1 < args.length && ", "}
                    </span>
                  ))}
                  )
                </>
              )}
            </FunctionHelpCode>
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
