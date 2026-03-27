import {
  type ChangeEvent,
  Children,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { Markdown } from "metabase/common/components/Markdown";
import { useSelector } from "metabase/lib/redux";
import type { HelpText } from "metabase/querying/expressions";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon, Input, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { HighlightExpressionSource } from "../HighlightExpression";

import S from "./FunctionBrowser.module.css";
import { getDatabase, getFilteredClauses, getSearchPlaceholder } from "./utils";

const components = {
  code(props: { children: ReactNode }) {
    const children = Children.toArray(props.children);
    if (!children.every((child) => typeof child === "string")) {
      return <code>{children}</code>;
    }

    const source = children.join("").replace(/^\$/, "");

    return <HighlightExpressionSource inline expression={source} />;
  },
};

export function FunctionBrowser({
  expressionMode,
  reportTimezone,
  query,
  onClauseClick,
}: {
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  reportTimezone?: string;
  onClauseClick?: (name: string) => void;
}) {
  const metadata = useSelector(getMetadata);
  const database = getDatabase(query, metadata);

  const [filter, setFilter] = useState("");
  const handleFilterChange = useCallback(
    (evt: ChangeEvent<HTMLInputElement>) => setFilter(evt.target.value),
    [],
  );

  const filteredClauses = useMemo(
    () =>
      getFilteredClauses({ expressionMode, filter, database, reportTimezone }),
    [filter, expressionMode, database, reportTimezone],
  );

  const isEmpty = filteredClauses.length === 0;

  return (
    <Flex
      pt="sm"
      direction="column"
      className={S.wrapper}
      data-testid="expression-editor-function-browser"
    >
      <Input
        size="sm"
        mb="sm"
        mx="md"
        placeholder={getSearchPlaceholder(expressionMode)}
        value={filter}
        onChange={handleFilterChange}
        leftSection={<Icon name="search" />}
      />
      <Flex
        component="dl"
        my={0}
        pt={0}
        pb="md"
        direction="column"
        justify={isEmpty ? "center" : "flex-start"}
        className={S.results}
      >
        {isEmpty && (
          <EmptyState message={t`Didn't find any results`} icon="search" />
        )}
        {filteredClauses.map((group) => (
          <>
            <Text size="sm" p="md" pb="sm" c="text-secondary" fw="bold">
              {group.displayName}
            </Text>
            {group.clauses.map((clause) => (
              <FunctionBrowserItem
                key={clause.name}
                onClauseClick={onClauseClick}
                clause={clause}
              />
            ))}
          </>
        ))}
      </Flex>
    </Flex>
  );
}

function FunctionBrowserItem({
  onClauseClick,
  clause,
}: {
  onClauseClick?: (name: string) => void;
  clause: HelpText;
}) {
  const handleMouseDown = useCallback(
    (evt: MouseEvent<HTMLDivElement>) => {
      evt.preventDefault();
      if (clause.name) {
        onClauseClick?.(clause.name);
      }
    },
    [onClauseClick, clause.name],
  );
  return (
    <Box
      role="button"
      key={clause.name}
      className={S.clause}
      px="md"
      py="sm"
      onMouseDown={handleMouseDown}
    >
      <dt>
        <Text size="md" pb="xs" fw="bold" className={S.name}>
          {clause.displayName}
        </Text>
      </dt>
      <dd className={S.description}>
        <Text size="sm" c="text-secondary">
          <Markdown components={components}>{clause.description}</Markdown>
        </Text>
      </dd>
    </Box>
  );
}
