import { Children, Fragment, type ReactNode } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Markdown } from "metabase/common/components/Markdown";
import { useDocsUrl } from "metabase/common/hooks";
import { getHelpText } from "metabase/querying/expressions";
import { Icon } from "metabase/ui";
import type { Database } from "metabase-types/api";

import {
  HighlightExpressionParts,
  HighlightExpressionSource,
} from "../HighlightExpression";

import S from "./ExpressionSidePanel.module.css";

const MARKDOWN_COMPONENTS = {
  code(props: { children: ReactNode }) {
    const children = Children.toArray(props.children);
    if (!children.every((child) => typeof child === "string")) {
      return <code>{children}</code>;
    }
    const source = children.join("");
    // `$name` is the name of an argument.
    if (source.startsWith("$")) {
      return <code className={S.argName}>{source.slice(1)}</code>;
    }
    return <HighlightExpressionSource inline expression={source} />;
  },
};

type FunctionDetailProps = {
  /** The clause name of the function. */
  name: string;
  database: Database;
  reportTimezone?: string;
  /** The database lacks a feature the function needs. */
  isDisabled: boolean;
};

/**
 * The page of a function in the docs panel: what the old editor showed in its
 * help popover. The signature, the description, the arguments, an example
 * and a link to the docs.
 */
export function FunctionDetail({
  name,
  database,
  reportTimezone,
  isDisabled,
}: FunctionDetailProps) {
  const helpText = getHelpText(name, database, reportTimezone);
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    helpText?.docsUrl ?? "",
  );
  if (helpText == null) {
    return null;
  }

  const { displayName, args, description, example } = helpText;

  return (
    <div className={S.detail} data-testid="expression-side-panel-detail">
      {isDisabled && (
        <div className={S.detailNotice}>
          {t`This database doesn't support ${displayName}.`}
        </div>
      )}

      <div className={S.signature}>
        {displayName}(
        {args.map((arg, index) => (
          <Fragment key={index}>
            <span className={S.argName}>{arg.name}</span>
            {index < args.length - 1 && ", "}
          </Fragment>
        ))}
        )
      </div>

      <div className={S.detailText}>
        <Markdown components={MARKDOWN_COMPONENTS}>{description}</Markdown>
      </div>

      {args.length > 0 && (
        <div className={S.arguments}>
          {args.map((arg, index) => (
            <Fragment key={index}>
              <div className={S.argName}>{arg.name}</div>
              <div className={S.detailText}>
                <Markdown components={MARKDOWN_COMPONENTS}>
                  {arg.description ?? ""}
                </Markdown>
              </div>
            </Fragment>
          ))}
        </div>
      )}

      <div className={S.example}>
        <div className={S.exampleTitle}>{t`Example`}</div>
        <HighlightExpressionParts expression={example} printWidth={40} />
      </div>

      {showMetabaseLinks && (
        <ExternalLink className={S.learnMore} href={docsUrl} target="_blank">
          <Icon name="reference" size={12} />
          {t`Learn more`}
        </ExternalLink>
      )}
    </div>
  );
}
