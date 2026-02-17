import cx from "classnames";
import {
  Children,
  Fragment,
  type MouseEvent,
  type ReactNode,
  useCallback,
} from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import { useDocsUrl } from "metabase/common/hooks";
import {
  type HelpText,
  expressionModeSupportsClause,
  getClauseDefinition,
  getHelpText,
} from "metabase/querying/expressions";
import { Box, Flex, Icon, UnstyledButton } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import {
  HighlightExpressionParts,
  HighlightExpressionSource,
} from "../../HighlightExpression";

import S from "./HelpText.module.css";

function wrapPlaceholder(name: string) {
  if (name === "…") {
    return name;
  }

  return name;
}

export type HelpTextProps = {
  open?: boolean;
  onToggle?: () => void;
  enclosingFunction?: {
    name: string;
    arg: {
      index: number;
    } | null;
  } | null;
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;
  expressionMode: Lib.ExpressionMode;
};

function getDatabase(query: Lib.Query, metadata: Metadata) {
  const databaseId = Lib.databaseID(query);
  return metadata.database(databaseId);
}

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

export function HelpText({
  open = true,
  onToggle,
  enclosingFunction,
  query,
  metadata,
  reportTimezone,
  expressionMode,
}: HelpTextProps) {
  const database = getDatabase(query, metadata);
  const helpText =
    enclosingFunction && database
      ? getHelpText(enclosingFunction.name, database, reportTimezone)
      : null;

  const clause = helpText && getClauseDefinition(helpText.name);
  const isSupported =
    clause &&
    database?.hasFeature(clause?.requiresFeature) &&
    expressionModeSupportsClause(expressionMode, clause.name);

  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    helpText?.docsUrl ?? "",
  );

  const handleMouseDown = useCallback(
    (evt: MouseEvent<HTMLDivElement>) => {
      evt.stopPropagation();
      evt.preventDefault();
      onToggle?.();
    },
    [onToggle],
  );

  const handleContentMouseDown = useCallback(
    (evt: MouseEvent<HTMLDivElement>) => {
      evt.stopPropagation();
    },
    [],
  );

  if (!helpText || !clause || !isSupported) {
    return null;
  }

  const { description, displayName: structure, args, example } = helpText;
  const argIndex = enclosingFunction?.arg?.index ?? -1;

  return (
    <>
      <Flex
        className={S.usage}
        onMouseDown={handleMouseDown}
        data-testid="expression-helper-popover-structure"
        role="button"
      >
        <Box>
          {structure}
          {
            <>
              (
              {args?.map(({ name }, index) => (
                <span key={index}>
                  <span
                    className={cx(S.arg, {
                      [S.active]:
                        argIndex === index ||
                        (name === "…" && argIndex > args.length - 1),
                    })}
                  >
                    {wrapPlaceholder(name)}
                  </span>
                  {index < args.length - 1 && ", "}
                </span>
              ))}
              )
            </>
          }
        </Box>
        <UnstyledButton className={S.toggle} px="sm">
          <Icon
            name="chevronright"
            width={12}
            className={cx(S.chevron, { [S.open]: open })}
          />
        </UnstyledButton>
      </Flex>

      {open && (
        <Box
          className={S.info}
          data-testid="expression-helper"
          onMouseDown={handleContentMouseDown}
        >
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
                  <Box className={S.arg} data-testid={`arg-${name}-name`}>
                    {wrapPlaceholder(name)}
                  </Box>
                  <Box data-testid={`arg-${name}-description`}>
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
      )}
    </>
  );
}
