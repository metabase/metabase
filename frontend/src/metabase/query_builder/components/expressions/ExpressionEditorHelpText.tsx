import * as React from "react";
import { t } from "ttag";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import MetabaseSettings from "metabase/lib/settings";
import type { HelpText } from "metabase-lib/expressions/types";
import { getHelpDocsUrl } from "metabase-lib/expressions/helper-text-strings";
import {
  ArgumentTitle,
  ArgumentsGrid,
  BlockSubtitleText,
  Container,
  Divider,
  DocumentationLink,
  ExampleCode,
  FunctionHelpCode,
  FunctionHelpCodeArgument,
  LearnMoreIcon,
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
            <FunctionHelpCode data-testid="expression-helper-popover-structure">
              {structure}
              {args != null && (
                <>
                  (
                  {args.map(({ name }, index) => (
                    <span key={name}>
                      <FunctionHelpCodeArgument>
                        {name}
                      </FunctionHelpCodeArgument>
                      {index + 1 < args.length && ", "}
                    </span>
                  ))}
                  )
                </>
              )}
            </FunctionHelpCode>
            <Divider />

            <div>{description}</div>

            {args != null && (
              <ArgumentsGrid data-testid="expression-helper-popover-arguments">
                {args.map(({ name, description: argDescription }) => (
                  <React.Fragment key={name}>
                    <ArgumentTitle>{name}</ArgumentTitle>
                    <div>{argDescription}</div>
                  </React.Fragment>
                ))}
              </ArgumentsGrid>
            )}

            <BlockSubtitleText>{t`Example`}</BlockSubtitleText>
            <ExampleCode>{helpText.example}</ExampleCode>
            <DocumentationLink
              href={MetabaseSettings.docsUrl(getHelpDocsUrl(helpText))}
              target="_blank"
            >
              <LearnMoreIcon name="reference" size={12} />
              {t`Learn more`}
            </DocumentationLink>
          </Container>
        </>
      }
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ExpressionEditorHelpText;
