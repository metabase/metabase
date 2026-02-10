import { t } from "ttag";

import { useBreakoutData } from "embedding-sdk-bundle/components/private/SdkQuestion/components/Breakout/use-breakout-data";
import { useFilterData } from "embedding-sdk-bundle/components/private/SdkQuestion/components/Filter/hooks/use-filter-data";
import { useSummarizeData } from "embedding-sdk-bundle/components/private/SdkQuestion/components/Summarize/use-summarize-data";
import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { isNotNull } from "metabase/lib/types";
import { Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export function QuestionDetails() {
  const { question } = useSdkQuestionContext();
  const tableSection = getTableSection(question);

  const filterItems = useFilterData();
  const filterSection =
    filterItems.length > 0
      ? t`Filtered by ` +
        filterItems.map((filter) => filter.longDisplayName).join(" and ") +
        "."
      : "";

  const summarizationItems = useSummarizeData();
  const summarizationSection =
    summarizationItems.length > 0
      ? t`Summarized by ` +
        summarizationItems.map((filter) => filter.displayName).join(" and ") +
        "."
      : "";

  const groupingItems = useBreakoutData();
  const groupingSection =
    groupingItems.length > 0
      ? t`Grouped by ` +
        groupingItems.map((filter) => filter.longDisplayName).join(" and ") +
        "."
      : "";

  const sections = [
    tableSection,
    filterSection,
    summarizationSection,
    groupingSection,
  ].filter((section) => section.length > 0);

  return (
    <Text size="0.75rem" c="text-tertiary">
      {sections.join(" ")}
    </Text>
  );
}

function getTableSection(question?: Question) {
  return (
    getAllTables(question)
      .map((table) => table.displayName())
      .join(" + ") + "."
  );
}

function getAllTables(question?: Question) {
  if (!question) {
    return [];
  }

  const metadata = question.metadata();
  const query = question.query();
  const table = metadata.table(Lib.sourceTableOrCardId(query));
  return [
    table,
    ...Lib.joins(query, -1)
      .map((join) => {
        const thing = Lib.joinedThing(query, join);
        return thing ? Lib.pickerInfo(query, thing) : undefined;
      })
      .map((pickerInfo) => {
        if (pickerInfo?.tableId != null) {
          return metadata.table(pickerInfo.tableId);
        }

        return undefined;
      }),
  ].filter(isNotNull);
}
