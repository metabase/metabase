import { useMemo } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { getQuestionWithoutComposing } from "metabase/query_builder/selectors";
import { Flex, Icon, Stack, Text } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";

import { ToggleFullList } from "./ToggleFullList";
import { useExpandableList, useGetJoinedTablesWithIcons } from "./hooks";
import type { QuestionSource } from "./types";

/** Displays tables linked to the question via a foreign-key relationship */
export const TablesLinkedToQuestion = () => {
  const question = useSelector(getQuestionWithoutComposing);
  const getJoinedTables = useGetJoinedTablesWithIcons();
  const joinedTablesWithIcons: QuestionSource[] = useMemo(
    () => (question ? getJoinedTables(question) : []),
    [question, getJoinedTables],
  );

  const { filtered, isExpanded, toggle } = useExpandableList(
    joinedTablesWithIcons,
  );

  if (!question) {
    return null;
  }

  return (
    <Stack gap="sm">
      {!filtered.length && (
        <Text lh={1} color="text-secondary">
          {question.type() === "model"
            ? t`This model is not linked to any tables.`
            : t`This question is not linked to any tables.`}
        </Text>
      )}
      {filtered.map(({ href, name, iconProps }) => (
        <Link to={href} key={href} variant="brand">
          <Flex gap="sm" lh="1.25rem">
            {iconProps ? <Icon mt={2} c="text-primary" {...iconProps} /> : null}
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
