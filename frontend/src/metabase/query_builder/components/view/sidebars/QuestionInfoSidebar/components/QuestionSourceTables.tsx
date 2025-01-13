import { useMemo } from "react";

import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getQuestionWithParameters } from "metabase/query_builder/selectors";
import { getUrl } from "metabase/querying/notebook/components/NotebookDataPicker/utils";
import { Flex, Icon, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ToggleFullList } from "./ToggleFullList";
import { useExpandableList } from "./hooks";
import type { QuestionSource } from "./types";
import { getIconPropsForSource } from "./utils";

export const QuestionSourceTables = () => {
  /** Retrieve current question from the Redux store */
  const questionWithParameters = useSelector(getQuestionWithParameters);

  const joinedTablesWithIcons: QuestionSource[] = useMemo(() => {
    const query = questionWithParameters?.query();
    if (!query) {
      return [];
    }
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

    return joinedTables.map(source => ({
      ...source,
      iconProps: getIconPropsForSource(source),
    }));
  }, [questionWithParameters]);

  const { filtered, isExpanded, toggle } = useExpandableList(
    joinedTablesWithIcons,
  );

  if (!questionWithParameters || !joinedTablesWithIcons.length) {
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
        fullLength={joinedTablesWithIcons.length}
      />
    </Stack>
  );
};
