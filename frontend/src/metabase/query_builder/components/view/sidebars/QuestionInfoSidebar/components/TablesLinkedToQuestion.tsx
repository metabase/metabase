import { useMemo } from "react";
import { t } from "ttag";

import { DetailsTable } from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import { useSelector } from "metabase/redux";
import { Flex, Icon, Text } from "metabase/ui";

import { getQuestionWithoutComposing } from "../../../../../store/selectors";

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
    <DetailsTable>
      {!filtered.length && (
        <Text px="lg" py="sm" c="text-secondary">
          {question.type() === "model"
            ? t`This model is not linked to any tables.`
            : t`This question is not linked to any tables.`}
        </Text>
      )}
      {filtered.map(({ href, name, iconProps }) => (
        <Flex key={href} px="lg" py="sm">
          <Link to={href} variant="brand">
            <Flex gap="sm" lh="1.25rem">
              {iconProps ? (
                <Icon mt={2} c="text-primary" {...iconProps} />
              ) : null}
              {name}
            </Flex>
          </Link>
        </Flex>
      ))}
      <ToggleFullList
        isExpanded={isExpanded}
        toggle={toggle}
        sliceLength={filtered.length}
        fullLength={joinedTablesWithIcons.length}
      />
    </DetailsTable>
  );
};
