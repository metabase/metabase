import { useMemo } from "react";
import { t } from "ttag";

import Link from "metabase/core/components/Link";
import { Flex, Icon, Stack, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { ToggleFullList } from "./ToggleFullList";
import { useExpandableList } from "./hooks";
import type { QuestionSource } from "./types";
import { getJoinedTablesWithIcons } from "./utils";

/** Displays tables linked to the question via a foreign-key relationship */
export const TablesLinkedToQuestion = ({
  question,
}: {
  question: Question;
}) => {
  const joinedTablesWithIcons: QuestionSource[] = useMemo(
    () => getJoinedTablesWithIcons(question),
    [question],
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
