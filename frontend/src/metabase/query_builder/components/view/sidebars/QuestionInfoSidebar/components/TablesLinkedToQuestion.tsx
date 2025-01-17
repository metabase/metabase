import { useMemo } from "react";
import { t } from "ttag";

import Link from "metabase/core/components/Link";
import { getUrl } from "metabase/querying/notebook/components/NotebookDataPicker/utils";
import { Flex, Icon, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { ToggleFullList } from "./ToggleFullList";
import { useExpandableList } from "./hooks";
import type { QuestionSource } from "./types";
import { getIconPropsForSource } from "./utils";

/** Displays tables linked to the question via a foreign-key relationship */
export const TablesLinkedToQuestion = ({
  question,
}: {
  question: Question;
}) => {
  const joinedTablesWithIcons: QuestionSource[] = useMemo(() => {
    const query = question?.query();

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
  }, [question]);

  const { filtered, isExpanded, toggle } = useExpandableList(
    joinedTablesWithIcons,
  );

  if (!question) {
    return null;
  }

  return (
    <Stack spacing="sm">
      {!filtered.length && (
        <Text lh={1} color="text-medium">
          {question.type() === "model"
            ? t`This model is not linked to any tables.`
            : t`This question is not linked to any tables.`}
        </Text>
      )}
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
