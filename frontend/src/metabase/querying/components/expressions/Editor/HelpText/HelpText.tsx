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
import { hasRequiredFeature } from "metabase/databases";
import {
  type EnclosingFunctionArg,
  expressionModeSupportsClause,
  getClauseDefinition,
  getHelpText,
} from "metabase/querying/expressions";
import { Box, Flex, Icon, UnstyledButton } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

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

function isPositionalArgActive(
  name: string,
  index: number,
  argCount: number,
  enclosingArg:
    | Pick<EnclosingFunctionArg, "index" | "named">
    | null
    | undefined,
) {
  if (enclosingArg == null || enclosingArg.named != null) {
    return false;
  }

  return (
    enclosingArg.index === index ||
    (name === "…" && enclosingArg.index > argCount - 1)
  );
}

function isNamedArgActive(name: string, named: string | undefined) {
  return named != null && name.toLowerCase() === named.toLowerCase();
}

export type HelpTextProps = {
  open?: boolean;
  onToggle?: () => void;
  enclosingFunction?: {
    name: string;
    arg: Pick<EnclosingFunctionArg, "index" | "named"> | null;
  } | null;
  database: Pick<Database, "engine" | "features"> | undefined;
  reportTimezone?: string;
  expressionMode: Lib.ExpressionMode;
  allowTransformOnlyFunctions?: boolean;
};

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
  database,
  reportTimezone,
  expressionMode,
  allowTransformOnlyFunctions,
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
    expressionModeSupportsClause(expressionMode, clause.name) &&
    (clause.name !== "prompt" || Boolean(allowTransformOnlyFunctions));

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

  const {
    description,
    displayName: structure,
    args,
    namedArgs,
    example,
  } = helpText;
  const enclosingArg = enclosingFunction?.arg;
  const signatureItems = [
    ...args.map((arg, index) => ({
      key: `arg-${index}`,
      name: arg.name,
      active: isPositionalArgActive(arg.name, index, args.length, enclosingArg),
    })),
    ...namedArgs.map((arg) => ({
      key: `named-${arg.name}`,
      name: arg.name,
      active: isNamedArgActive(arg.name, enclosingArg?.named),
    })),
  ];

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
              {signatureItems.map(({ key, name, active }, index) => (
                <span key={key}>
                  <span
                    className={cx(S.arg, { [S.active]: active })}
                    data-active={active || undefined}
                  >
                    {wrapPlaceholder(name)}
                  </span>
                  {index < signatureItems.length - 1 && ", "}
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

          {(args.length > 0 || namedArgs.length > 0) && (
            <Box
              className={S.arguments}
              data-testid="expression-helper-popover-arguments"
            >
              {[...args, ...namedArgs].map(({ name, description }) => (
                <Fragment key={name}>
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
