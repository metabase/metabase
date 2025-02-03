import cx from "classnames";
import { Fragment, useCallback, useState } from "react";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Flex, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import { MBQL_CLAUSES } from "metabase-lib/v1/expressions/config";
import {
  getHelpDocsUrl,
  getHelpText,
} from "metabase-lib/v1/expressions/helper-text-strings";
import type { HelpText } from "metabase-lib/v1/expressions/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { Highlight } from "../Highlight";

import S from "./HelpText.module.css";

function wrapPlaceholder(name: string) {
  if (name === "…") {
    return name;
  }

  return `⟨${name}⟩`;
}

export type HelpTextProps = {
  enclosingFunction?: {
    name: string;
    arg: {
      index: number;
    } | null;
  } | null;
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;
};

function getDatabase(query: Lib.Query, metadata: Metadata) {
  const databaseId = Lib.databaseID(query);
  return metadata.database(databaseId);
}

export function HelpText({
  enclosingFunction,
  query,
  metadata,
  reportTimezone,
}: HelpTextProps) {
  const [open, setOpen] = useState(true);

  const database = getDatabase(query, metadata);
  const helpText =
    enclosingFunction && database
      ? getHelpText(enclosingFunction.name, database, reportTimezone)
      : null;

  const clause = helpText && MBQL_CLAUSES[helpText?.name];
  const isSupported = clause && database?.hasFeature(clause?.requiresFeature);

  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    helpText ? getHelpDocsUrl(helpText) : "",
  );

  const handleMouseDown = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      evt.preventDefault();
      setOpen(open => !open);
    },
    [],
  );

  if (!helpText || !clause || !isSupported) {
    return null;
  }

  const { description, structure, args, example } = helpText;
  const argIndex = enclosingFunction?.arg?.index ?? -1;

  return (
    <Flex
      className={S.helpText}
      data-testid="expression-helper"
      direction="column"
    >
      <Box
        className={S.usage}
        onMouseDown={handleMouseDown}
        data-testid="expression-helper-popover-structure"
      >
        {structure}
        {args != null && (
          <>
            (
            {args.map(({ name }, index) => (
              <span key={name}>
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
        )}
      </Box>

      {open && (
        <Box className={S.info}>
          <Box>{description}</Box>

          {args != null && (
            <Box
              className={S.arguments}
              data-testid="expression-helper-popover-arguments"
            >
              {args.map(({ name, description }) => (
                <Fragment key={name}>
                  <Box className={S.arg}>{wrapPlaceholder(name)}</Box>
                  <Box>{description}</Box>
                </Fragment>
              ))}
            </Box>
          )}

          {example && (
            <>
              <Box className={S.title}>{t`Example`}</Box>
              <Box
                className={S.example}
                data-testid="expression-helper-example"
              >
                <Highlight expression={example} />
              </Box>
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
    </Flex>
  );
}
