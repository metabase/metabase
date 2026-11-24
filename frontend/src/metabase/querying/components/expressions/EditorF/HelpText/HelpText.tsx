import { Children, Fragment, type ReactNode } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import { useDocsUrl } from "metabase/common/hooks";
import { hasRequiredFeature } from "metabase/databases";
import {
  expressionModeSupportsClause,
  getClauseDefinition,
  getHelpText,
} from "metabase/querying/expressions";
import { Box, Icon } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import {
  HighlightExpressionParts,
  HighlightExpressionSource,
} from "../../HighlightExpression";

import S from "./HelpText.module.css";

const components = {
  code(props: { children: ReactNode }) {
    const children = Children.toArray(props.children);
    if (!children.every((child) => typeof child === "string")) {
      return <code>{children}</code>;
    }
    const source = children.join("");

    if (source.startsWith("$")) {
      // The code is an argument name
      return <code className={S.arg}>{source.slice(1)}</code>;
    }

    return <HighlightExpressionSource inline expression={source} />;
  },
};

/**
 * The reference of a function: its signature, description, arguments and
 * example. The help popover of the old editor (master), without its toggle.
 */
export function HelpText({
  name,
  database,
  reportTimezone,
  expressionMode,
}: {
  name: string;
  database: Pick<Database, "engine" | "features"> | undefined;
  reportTimezone?: string;
  expressionMode: Lib.ExpressionMode;
}) {
  const helpText = database
    ? getHelpText(name, database, reportTimezone)
    : null;

  const clause = helpText && getClauseDefinition(helpText.name);
  const isSupported =
    clause &&
    database != null &&
    hasRequiredFeature(database, clause?.requiresFeature) &&
    expressionModeSupportsClause(expressionMode, clause.name);

  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    helpText?.docsUrl ?? "",
  );

  if (!helpText || !clause || !isSupported) {
    return null;
  }

  const { description, displayName: structure, args, example } = helpText;

  return (
    <div className={S.root} data-testid="expression-helper">
      <Box
        className={S.usage}
        data-testid="expression-helper-popover-structure"
      >
        {structure}(
        {args?.map(({ name }, index) => (
          <span key={index}>
            <span className={S.arg}>{name}</span>
            {index < args.length - 1 && ", "}
          </span>
        ))}
        )
      </Box>

      <Box className={S.info}>
        <Box>
          <Markdown components={components}>{description}</Markdown>
        </Box>

        {args != null && (
          <Box
            className={S.arguments}
            data-testid="expression-helper-popover-arguments"
          >
            {args.map(({ name, description }, index) => (
              <Fragment key={index}>
                <Box className={S.arg}>{name}</Box>
                <Box>
                  <Markdown components={components}>
                    {description ?? ""}
                  </Markdown>
                </Box>
              </Fragment>
            ))}
          </Box>
        )}

        {example != null && (
          <>
            <Box className={S.title}>{t`Example`}</Box>
            <HighlightExpressionParts
              expression={example}
              printWidth={50}
              data-testid="helptext-example"
            />
          </>
        )}

        {showMetabaseLinks && (
          <ExternalLink
            className={S.documentationLink}
            href={docsUrl}
            target="_blank"
          >
            <Icon m="0.25rem 0.5rem" name="reference" size={12} />
            {t`Learn more`}
          </ExternalLink>
        )}
      </Box>
    </div>
  );
}
