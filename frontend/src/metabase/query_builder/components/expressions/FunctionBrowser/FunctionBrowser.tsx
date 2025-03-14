import { type ChangeEvent, useCallback, useMemo, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Flex, Icon, Input, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";
import { MBQL_CLAUSES } from "metabase-lib/v1/expressions";

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
      <Box component="dl" my={0} pt={0} pb="md" className={S.results}>
        {filteredClauses.map(
          clause =>
            clause.name && (
              <Box
                role="button"
                key={clause.name}
                className={S.clause}
                px="md"
                py="xs"
                onMouseDown={evt => {
                  evt.preventDefault();
                  if (clause.name) {
                    const structure = MBQL_CLAUSES[clause.name].displayName;
                    onClauseClick?.(structure);
                  }
                }}
              >
                <dt className={S.name}>
                  <Text size="sm">{clause.structure}</Text>
                </dt>
                <dd className={S.description}>
                  <Text size="sm" c="var(--mb-color-text-medium)">
                    {clause.description}
                  </Text>
                </dd>
              </Box>
            ),
        )}
      </Box>
    </Flex>
  );
}
