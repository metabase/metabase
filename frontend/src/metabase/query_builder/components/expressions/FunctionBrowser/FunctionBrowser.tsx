import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import EmptyState from "metabase/components/EmptyState";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon, Input, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { HelpText } from "metabase-lib/v1/expressions";

import type { StartRule } from "../types";

import S from "./FunctionBrowser.module.css";
import { getDatabase, getFilteredClauses, getSearchPlaceholder } from "./utils";

export function FunctionBrowser({
  startRule,
  reportTimezone,
  query,
  onClauseClick,
}: {
  startRule: StartRule;
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
    () => getFilteredClauses({ startRule, filter, database, reportTimezone }),
    [filter, startRule, database, reportTimezone],
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
        placeholder={getSearchPlaceholder(startRule)}
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
        {filteredClauses.map(group => (
          <>
            <Text
              size="sm"
              p="md"
              pb="sm"
              c="var(--mb-color-text-medium)"
              fw="bold"
            >
              {group.displayName}
            </Text>
            {group.clauses.map(clause => (
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
      py="xs"
      onMouseDown={handleMouseDown}
    >
      <dt className={S.name}>
        <Text size="md">{clause.structure}</Text>
      </dt>
      <dd className={S.description}>
        <Text size="sm" c="var(--mb-color-text-medium)">
          {clause.description}
        </Text>
      </dd>
    </Box>
  );
}
