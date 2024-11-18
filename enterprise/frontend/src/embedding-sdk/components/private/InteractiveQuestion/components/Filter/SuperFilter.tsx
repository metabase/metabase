import { MultiStepPopover } from "embedding-sdk/components/private/util/MultiStepPopover";
import { ToolbarButton } from "../util/ToolbarButton";
import { FilterPicker } from "embedding-sdk/components/private/InteractiveQuestion/components";
import { useState } from "react";

import { useMemo } from "react";

import { getFilterItems } from "metabase/querying/filters/components/FilterPanel/utils";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import { useInteractiveQuestionContext } from "embedding-sdk/components/private/InteractiveQuestion/context";
import { BadgeList } from "../util/BadgeList";

export type UseSelectedFiltersProps = {
  question: Question;
  updateQuestion: (question: Question, opts: { run: boolean }) => void;
};

export const useSelectedFilters = ({
  question,
  updateQuestion,
}: UseSelectedFiltersProps) => {
  const query = question.query();

  const items = useMemo(() => getFilterItems(query), [query]);

  const updateFilter = (query: Lib.Query) => {
    updateQuestion(question.setQuery(Lib.dropEmptyStages(query)), {
      run: true,
    });
  };

  return items.map(({ filter, stageIndex }) => {
    const { displayName, longDisplayName, name, table } = Lib.displayInfo(
      query,
      stageIndex,
      filter,
    );
    const handleChange = (newFilter: Lib.Clause | Lib.SegmentMetadata) => {
      updateFilter(Lib.replaceClause(query, stageIndex, filter, newFilter));
    };

    const handleRemove = () => {
      updateFilter(Lib.removeClause(query, stageIndex, filter));
    };

    return {
      query,
      filter,
      stageIndex,
      displayName,
      longDisplayName,
      name,
      table,
      handleChange,
      handleRemove,
    };
  });
};

export const SuperFilterInner = ({ question, updateQuestion }) => {
  const filterItems = useSelectedFilters({ question, updateQuestion });

  const [step, setStep] = useState<"picker" | "list">("list");

  return (
    <MultiStepPopover currentStep={step}>
      <MultiStepPopover.Target>
        <ToolbarButton
          label="Filters"
          icon="filter"
          isHighlighted={filterItems.length > 0}
        ></ToolbarButton>
      </MultiStepPopover.Target>
      <MultiStepPopover.Step value="list">
        <BadgeList
          items={filterItems.map(item => {
            return {
              name: item.displayName,
              item,
            };
          })}
        ></BadgeList>
      </MultiStepPopover.Step>
      <MultiStepPopover.Step value="picker">
        <FilterPicker />
      </MultiStepPopover.Step>
    </MultiStepPopover>
  );
};

export const SuperFilter = () => {
  const { question, updateQuestion } = useInteractiveQuestionContext();

  if (!question) {
    return null;
  }

  return (
    <SuperFilterInner question={question} updateQuestion={updateQuestion} />
  );
};
