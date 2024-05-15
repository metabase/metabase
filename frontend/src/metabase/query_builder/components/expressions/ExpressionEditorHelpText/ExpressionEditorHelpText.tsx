import type { RefObject } from "react";
import { Fragment } from "react";
import { t } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import { useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { DEFAULT_POPOVER_Z_INDEX } from "metabase/ui";
import { getHelpDocsUrl } from "metabase-lib/v1/expressions/helper-text-strings";
import type { HelpText } from "metabase-lib/v1/expressions/types";

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

export type ExpressionEditorHelpTextContentProps = {
  helpText: HelpText | null | undefined;
};

export type ExpressionEditorHelpTextProps =
  ExpressionEditorHelpTextContentProps & {
    target: RefObject<HTMLElement>;
    width: number | undefined;
  };

export const ExpressionEditorHelpTextContent = ({
  helpText,
}: ExpressionEditorHelpTextContentProps) => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  if (!helpText) {
    return null;
  }

  const { description, structure, args } = helpText;

  return (
    <>
      {/* Prevent stealing focus from input box causing the help text to be closed (metabase#17548) */}
      <Container
        onMouseDown={evt => evt.preventDefault()}
        data-testid="expression-helper-popover"
      >
        <FunctionHelpCode data-testid="expression-helper-popover-structure">
          {structure}
          {args != null && (
            <>
              (
              {args.map(({ name }, index) => (
                <span key={name}>
                  <FunctionHelpCodeArgument>{name}</FunctionHelpCodeArgument>
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
              <Fragment key={name}>
                <ArgumentTitle>{name}</ArgumentTitle>
                <div>{argDescription}</div>
              </Fragment>
            ))}
          </ArgumentsGrid>
        )}

        <BlockSubtitleText>{t`Example`}</BlockSubtitleText>
        <ExampleCode>{helpText.example}</ExampleCode>
        {showMetabaseLinks && (
          <DocumentationLink
            href={MetabaseSettings.docsUrl(getHelpDocsUrl(helpText))}
            target="_blank"
          >
            <LearnMoreIcon name="reference" size={12} />
            {t`Learn more`}
          </DocumentationLink>
        )}
      </Container>
    </>
  );
};

export const ExpressionEditorHelpText = ({
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
      zIndex={DEFAULT_POPOVER_Z_INDEX}
      content={<ExpressionEditorHelpTextContent helpText={helpText} />}
    />
  );
};
