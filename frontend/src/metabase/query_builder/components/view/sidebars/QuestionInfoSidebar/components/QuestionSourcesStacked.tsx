import { useMemo } from "react";

import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getQuestionWithParameters } from "metabase/query_builder/selectors";
import { getUrl } from "metabase/querying/notebook/components/NotebookDataPicker/utils";
import { Flex, Icon, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getDataSourceParts } from "../../../ViewHeader/components/QuestionDataSource/utils";

import { ToggleFullList } from "./ToggleFullList";
import { useExpandableList } from "./hooks";
import type { QuestionSource } from "./types";
import { getIconPropsForSource } from "./utils";

export const QuestionSourcesStacked = () => {
  /** Retrieve current question from the Redux store */
  const questionWithParameters = useSelector(getQuestionWithParameters);

  const sourcesWithIcons: QuestionSource[] = useMemo(() => {
    const query = questionWithParameters?.query();
    // TODO: Might be possible to replace this with legacyQueryTable()
    const sources = questionWithParameters
      ? (getDataSourceParts({
          question: questionWithParameters,
          subHead: false,
          isObjectDetail: true,
          formatTableAsComponent: false,
        }) as QuestionSource[])
      : [];

    // Add joined tables
    if (query) {
      const stageIndexes = Lib.stageIndexes(query);
      const joinedTables = stageIndexes.flatMap(stageIndex => {
        const joins = Lib.joins(query, stageIndex);
        const joinedThings = joins.map(join => {
          const thing = Lib.joinedThing(query, join);
          const url = getUrl({ query, table: thing, stageIndex }) as string;
          const { displayName } = Lib.displayInfo(query, stageIndex, thing);
          return { name: displayName, href: url };
        });
        return joinedThings;
      });
      sources.push(...joinedTables);
    }

    return (
      sources
        // Don't include databases
        .filter(source => source.model !== "database")
        .map(source => ({
          ...source,
          iconProps: getIconPropsForSource(source),
        }))
    );
  }, [questionWithParameters]);

  const { filtered, isExpanded, toggle } = useExpandableList(sourcesWithIcons);

  if (!questionWithParameters || !sourcesWithIcons.length) {
    return null;
  }

  return (
    <Stack spacing="sm">
      {filtered.map(({ href, name, iconProps }) => (
        <Link to={href} key={href} variant="brand">
          <Flex gap="sm" lh="1.25rem">
            {iconProps ? <Icon mt={2} c="text-dark" {...iconProps} /> : null}
            {name}
          </Flex>
        </Link>
      ))}
      <ToggleFullList
        isExpanded={isExpanded}
        toggle={toggle}
        sliceLength={filtered.length}
        fullLength={sourcesWithIcons.length}
      />
    </Stack>
  );
};
