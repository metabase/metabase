import * as React from "react";
import { t } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { getHelpDocsUrl } from "metabase-lib/expressions/helper-text-strings";
import type { HelpText } from "metabase-lib/expressions/types";

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

export const ExpressionEditorHelpText = ({
  helpText,
  width,
  target,
}: ExpressionEditorHelpTextProps) => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  if (!helpText) {
    return null;
  }

  const { description, structure, args } = helpText;

  return (
    /* data-ignore-outside-clicks is required until this expression editor is migrated to the mantine's Popover */
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
            data-ignore-outside-clicks
          >
            <FunctionHelpCode
              data-testid="expression-helper-popover-structure"
              data-ignore-outside-clicks
            >
              {structure}
              {args != null && (
                <>
                  (
                  {args.map(({ name }, index) => (
                    <span key={name} data-ignore-outside-clicks>
                      <FunctionHelpCodeArgument data-ignore-outside-clicks>
                        {name}
                      </FunctionHelpCodeArgument>
                      {index + 1 < args.length && ", "}
                    </span>
                  ))}
                  )
                </>
              )}
            </FunctionHelpCode>
            <Divider data-ignore-outside-clicks />

            <div data-ignore-outside-clicks>{description}</div>

            {args != null && (
              <ArgumentsGrid
                data-testid="expression-helper-popover-arguments"
                data-ignore-outside-clicks
              >
                {args.map(({ name, description: argDescription }) => (
                  <React.Fragment key={name}>
                    <ArgumentTitle data-ignore-outside-clicks>
                      {name}
                    </ArgumentTitle>
                    <div data-ignore-outside-clicks>{argDescription}</div>
                  </React.Fragment>
                ))}
              </ArgumentsGrid>
            )}

            <BlockSubtitleText
              data-ignore-outside-clicks
            >{t`Example`}</BlockSubtitleText>
            <ExampleCode data-ignore-outside-clicks>
              {helpText.example}
            </ExampleCode>
            {showMetabaseLinks && (
              <DocumentationLink
                href={MetabaseSettings.docsUrl(getHelpDocsUrl(helpText))}
                target="_blank"
                data-ignore-outside-clicks
              >
                <LearnMoreIcon
                  name="reference"
                  size={12}
                  data-ignore-outside-clicks
                />
                {t`Learn more`}
              </DocumentationLink>
            )}
          </Container>
        </>
      }
    />
  );
};
