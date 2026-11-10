import cx from "classnames";
import { Children, type MouseEvent, type ReactNode } from "react";
import { c, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import { useDocsUrl } from "metabase/common/hooks";
import { hasRequiredFeature } from "metabase/databases";
import {
  expressionModeSupportsClause,
  getClauseDefinition,
  getHelpText,
} from "metabase/querying/expressions";
import { Button } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import {
  HighlightExpressionParts,
  HighlightExpressionSource,
} from "../../HighlightExpression";

import S from "./HelpText.module.css";

const DOCS_PAGE = "questions/query-builder/expressions-list";

export type HelpTextProps = {
  /**
   * `card` shows the description, docs link, example and structure.
   * `structure` shows only the structure, for when suggestions are open.
   */
  variant?: "card" | "structure";
  enclosingFunction?: {
    name: string;
    arg: {
      index: number;
    } | null;
  } | null;
  database: Pick<Database, "engine" | "features"> | undefined;
  reportTimezone?: string;
  expressionMode: Lib.ExpressionMode;
};

const MARKDOWN_COMPONENTS = {
  code(props: { children: ReactNode }) {
    const children = Children.toArray(props.children);
    if (!children.every((child) => typeof child === "string")) {
      return <code>{children}</code>;
    }
    const source = children.join("");

    if (source.startsWith("$")) {
      // The code is an argument name
      return <code className={S.argName}>{source.slice(1)}</code>;
    }

    return <HighlightExpressionSource inline expression={source} />;
  },
};

// Keeps clicks in the help from moving the cursor or closing the editor.
function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

export function HelpText({
  variant = "card",
  enclosingFunction,
  database,
  reportTimezone,
  expressionMode,
}: HelpTextProps) {
  const helpText =
    enclosingFunction && database
      ? getHelpText(enclosingFunction.name, database, reportTimezone)
      : null;

  const clause = helpText && getClauseDefinition(helpText.name);
  const isSupported =
    clause &&
    database != null &&
    hasRequiredFeature(database, clause?.requiresFeature) &&
    expressionModeSupportsClause(expressionMode, clause.name);

  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(DOCS_PAGE, {
    anchor: helpText?.displayName.toLowerCase(),
  });

  if (!helpText || !clause || !isSupported) {
    return null;
  }

  const structure = (
    <Structure
      displayName={helpText.displayName}
      args={helpText.args}
      argIndex={enclosingFunction?.arg?.index ?? -1}
    />
  );

  if (variant === "structure") {
    return (
      <div
        className={S.structureOnly}
        data-testid="expression-helper-popover-structure"
        onMouseDown={stopPropagation}
      >
        {structure}
      </div>
    );
  }

  return (
    <div
      className={S.card}
      data-testid="expression-helper"
      onMouseDown={stopPropagation}
    >
      <div className={S.header}>
        <div className={S.description}>
          <Markdown components={MARKDOWN_COMPONENTS}>
            {helpText.description}
          </Markdown>
        </div>
        {showMetabaseLinks && (
          <Button
            component={ExternalLink}
            href={docsUrl}
            target="_blank"
            variant="subtle"
            size="compact-sm"
            className={S.docsButton}
          >
            {t`Docs`}
          </Button>
        )}
      </div>

      <div className={S.body}>
        <span className={S.exampleLabel}>
          {c("Short for 'for example', shown before a code example").t`e.g.`}
        </span>
        <div className={S.example}>
          <HighlightExpressionParts
            inline
            expression={helpText.example}
            data-testid="helptext-example"
          />
        </div>
        <div
          className={S.structure}
          data-testid="expression-helper-popover-structure"
        >
          {structure}
        </div>
      </div>
    </div>
  );
}

function Structure({
  displayName,
  args,
  argIndex,
}: {
  displayName: string;
  args: Lib.ClauseArgDefinition[];
  argIndex: number;
}) {
  return (
    <>
      {displayName}(
      {args.map(({ name }, index) => {
        const isRepeatedArg = name === "…" && argIndex > args.length - 1;
        const isActive = argIndex === index || isRepeatedArg;
        return (
          <span key={index}>
            <span
              className={cx(S.arg, { [S.active]: isActive })}
              data-active={isActive || undefined}
            >
              {name}
            </span>
            {index < args.length - 1 && ", "}
          </span>
        );
      })}
      )
    </>
  );
}
