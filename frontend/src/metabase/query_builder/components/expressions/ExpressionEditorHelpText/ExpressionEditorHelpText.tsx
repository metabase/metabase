import type { RefObject } from "react";
import { Fragment } from "react";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, DEFAULT_POPOVER_Z_INDEX, Icon } from "metabase/ui";
import { getHelpDocsUrl } from "metabase-lib/v1/expressions/helper-text-strings";
import type { HelpText } from "metabase-lib/v1/expressions/types";

import ExpressionEditorHelpTextS from "./ExpressionEditorHelpText.module.css";

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
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    helpText ? getHelpDocsUrl(helpText) : "",
  );

  if (!helpText) {
    return null;
  }

  const { description, structure, args } = helpText;

  return (
    <>
      {/* Prevent stealing focus from input box causing the help text to be closed (metabase#17548) */}
      <Box
        className={ExpressionEditorHelpTextS.Container}
        onMouseDown={evt => evt.preventDefault()}
        data-testid="expression-helper-popover"
      >
        <Box
          className={ExpressionEditorHelpTextS.FunctionHelpCode}
          data-testid="expression-helper-popover-structure"
        >
          {structure}
          {args != null && (
            <>
              (
              {args.map(({ name }, index) => (
                <span key={name}>
                  <Box
                    component="span"
                    className={
                      ExpressionEditorHelpTextS.FunctionHelpCodeArgument
                    }
                  >
                    {name}
                  </Box>
                  {index + 1 < args.length && ", "}
                </span>
              ))}
              )
            </>
          )}
        </Box>
        <Box className={ExpressionEditorHelpTextS.Divider} />

        <div>{description}</div>

        {args != null && (
          <Box
            className={ExpressionEditorHelpTextS.ArgumentsGrid}
            data-testid="expression-helper-popover-arguments"
          >
            {args.map(({ name, description: argDescription }) => (
              <Fragment key={name}>
                <Box className={ExpressionEditorHelpTextS.ArgumentTitle}>
                  {name}
                </Box>
                <div>{argDescription}</div>
              </Fragment>
            ))}
          </Box>
        )}

        <Box
          className={ExpressionEditorHelpTextS.BlockSubtitleText}
        >{t`Example`}</Box>
        <Box className={ExpressionEditorHelpTextS.ExampleCode}>
          {helpText.example}
        </Box>
        {showMetabaseLinks && (
          <ExternalLink
            className={ExpressionEditorHelpTextS.DocumentationLink}
            href={docsUrl}
            target="_blank"
          >
            <Icon m="0.25rem 0.5rem" name="reference" size={12} />
            {t`Learn more`}
          </ExternalLink>
        )}
      </Box>
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
