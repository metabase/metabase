import { t } from "ttag";

import {
  AggregationPicker,
  type AggregationPickerProps,
} from "metabase/common/components/AggregationPicker";
import * as Lib from "metabase-lib";

import { useSdkQuestionContext } from "../../../context";
import { BadgeList, type BadgeListProps } from "../../util/BadgeList";
import {
  type SDKAggregationItem,
  useSummarizeData,
} from "../use-summarize-data";

export const SummarizePicker = ({
  className,
  aggregation,
  ...aggregationPickerProps
}: {
  aggregation?: SDKAggregationItem;
} & Pick<AggregationPickerProps, "className" | "onClose" | "onBack">) => {
  const { question, updateQuestion } = useSdkQuestionContext();

  if (!question) {
    return null;
  }

  const query = question.query();
  const stageIndex = -1;
  const onQueryChange = (newQuery: Lib.Query) => {
    updateQuestion(question.setQuery(newQuery), { run: true });
  };

  return (
    <AggregationPicker
      className={className}
      query={query}
      stageIndex={stageIndex}
      clause={aggregation?.aggregation}
      clauseIndex={aggregation?.aggregationIndex}
      operators={
        aggregation?.operators ??
        Lib.availableAggregationOperators(query, stageIndex)
      }
      onQueryChange={onQueryChange}
      onBack={aggregationPickerProps.onBack}
      onClose={aggregationPickerProps.onClose}
    />
  );
};

export const SummarizeBadgeList = ({
  onSelectItem,
  onAddItem,
  onRemoveItem,
}: Pick<
  BadgeListProps<SDKAggregationItem>,
  "onRemoveItem" | "onAddItem" | "onSelectItem"
>) => {
  const aggregationItems = useSummarizeData();

  return (
    <BadgeList
      items={aggregationItems.map((item) => ({ item, name: item.displayName }))}
      addButtonLabel={t`Add grouping`}
      onSelectItem={onSelectItem}
      onAddItem={onAddItem}
      onRemoveItem={onRemoveItem}
    />
  );
};
