import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { match } from "ts-pattern";

import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import type { UpdateQueryHookProps } from "metabase/query_builder/hooks/types";
import {
  type AggregationItem,
  getAggregationItems,
} from "metabase/query_builder/utils/get-aggregation-items";
import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import { MultiStepPopover } from "../../util/MultiStepPopover";
import { useInteractiveQuestionContext } from "../context";

import { BadgeList } from "./util/BadgeList";

export const SummarizeInner = ({
  query,
  onQueryChange,
  stageIndex,
}: UpdateQueryHookProps) => {
  const aggregationItems = useMemo(
    () => getAggregationItems({ query, stageIndex }),
    [query, stageIndex],
  );

  const handleRemove = (aggregation: Lib.AggregationClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, aggregation);
    onQueryChange(nextQuery);
  };

  const label = match(aggregationItems.length)
    .with(0, () => `Summarize`)
    .with(1, () => `1 summary`)
    .otherwise(value => `${value} summaries`);

  const [selectedAggregationItem, setSelectedAggregationItem] =
    useState<AggregationItem>();

  const [step, setStep] = useState<"picker" | "list">("picker");
  const [opened, { close, toggle }] = useDisclosure(false, {
    onOpen: () => {
      if (aggregationItems.length === 0) {
        setStep("picker");
      } else {
        setStep("list");
      }
    },
  });

  return (
    <MultiStepPopover currentStep={step} opened={opened} onClose={close}>
      <MultiStepPopover.Target>
        <Button
          onClick={toggle}
          variant={aggregationItems.length === 0 ? "subtle" : "filled"}
          leftIcon={<Icon name="sum" />}
          py="sm"
          px="md"
        >
          {label}
        </Button>
      </MultiStepPopover.Target>
      <MultiStepPopover.Step value="picker">
        <AggregationPicker
          query={query}
          stageIndex={stageIndex}
          clause={selectedAggregationItem?.aggregation}
          clauseIndex={selectedAggregationItem?.aggregationIndex}
          operators={
            selectedAggregationItem?.operators ??
            Lib.availableAggregationOperators(query, stageIndex)
          }
          allowTemporalComparisons
          onQueryChange={onQueryChange}
          onClose={() => setStep("list")}
          onBack={() => setStep("list")}
        />
      </MultiStepPopover.Step>
      <MultiStepPopover.Step value="list">
        <BadgeList
          items={aggregationItems.map(item => ({
            name: item.displayName,
            item,
          }))}
          onSelectItem={item => {
            setSelectedAggregationItem(item);
            setStep("picker");
          }}
          onAddItem={() => {
            setStep("picker");
            setSelectedAggregationItem(undefined);
          }}
          onRemoveItem={item => {
            if (item) {
              handleRemove(item.aggregation);
            }
            if (aggregationItems.length === 1) {
              close();
            }
          }}
          addButtonLabel={"Add grouping"}
        />
      </MultiStepPopover.Step>
    </MultiStepPopover>
  );
};

export const Summarize = () => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  const query = question.query();

  const onQueryChange = (newQuery: Lib.Query) => {
    updateQuestion(question.setQuery(newQuery), { run: true });
  };

  return (
    <SummarizeInner
      query={query}
      onQueryChange={onQueryChange}
      stageIndex={-1}
    />
  );
};
