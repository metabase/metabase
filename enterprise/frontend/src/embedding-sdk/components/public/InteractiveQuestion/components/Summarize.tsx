import cx from "classnames";
import { useRef, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { AddAggregationButton } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/AddAggregationButton";
import { AggregationItem } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/AggregationItem";
import { BreakoutColumnList } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
import {
  STAGE_INDEX,
  useSummarizeQuery,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/SummarizeContent";
import { SectionTitle } from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/SummarizeSidebar.styled";
import { Button, Group, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { useInteractiveQuestionData } from "../hooks";

type SummarizeProps = {
  onClose: () => void;
};

export const Summarize = ({ onClose = () => {} }: Partial<SummarizeProps>) => {
  const { question } = useInteractiveQuestionData();

  return question && <SummarizeInner question={question} onClose={onClose} />;
};

const SummarizeInner = ({
  question,
  onClose,
}: {
  question: Question;
} & SummarizeProps) => {
  const { onQueryChange } = useInteractiveQuestionData();

  // save initial question in case we close without making changes
  const initialQuestion = useRef(question.query());

  const [currentQuery, setCurrentQuery] = useState<Lib.Query>(question.query());

  const onApplyFilter = () => {
    if (query) {
      onQueryChange(currentQuery);
      onClose();
    }
  };

  const onCloseFilter = () => {
    onQueryChange(initialQuestion.current);
    onClose();
  };

  const {
    aggregations,
    handleAddAggregations,
    handleAddBreakout,
    handleRemoveAggregation,
    handleRemoveBreakout,
    handleReplaceBreakouts,
    handleUpdateAggregation,
    handleUpdateBreakout,
    hasAggregations,
    query,
  } = useSummarizeQuery(currentQuery, setCurrentQuery);

  return (
    <Stack h="100%" w="100%" spacing="sm" className={CS.overflowHidden}>
      <Group
        spacing="sm"
        align="flex-start"
        className={cx(CS.overflowYScroll, CS.placeContentStart)}
      >
        {aggregations.map((aggregation, aggregationIndex) => (
          <AggregationItem
            key={
              Lib.displayInfo(currentQuery, STAGE_INDEX, aggregation)
                .longDisplayName
            }
            query={currentQuery}
            aggregation={aggregation}
            aggregationIndex={aggregationIndex}
            onAdd={handleAddAggregations}
            onUpdate={nextAggregation =>
              handleUpdateAggregation(aggregation, nextAggregation)
            }
            onRemove={() => handleRemoveAggregation(aggregation)}
          />
        ))}
        <AddAggregationButton
          query={currentQuery}
          onAddAggregations={handleAddAggregations}
        />
      </Group>

      {hasAggregations && (
        <Stack h="100%" className={cx(CS.flex1, CS.overflowYScroll)}>
          <SectionTitle>{t`Group by`}</SectionTitle>
          <BreakoutColumnList
            query={currentQuery}
            onAddBreakout={handleAddBreakout}
            onUpdateBreakout={handleUpdateBreakout}
            onRemoveBreakout={handleRemoveBreakout}
            onReplaceBreakout={handleReplaceBreakouts}
          />
        </Stack>
      )}
      <Group>
        <Button
          variant="filled"
          data-testid="apply-filters"
          onClick={onApplyFilter}
        >
          {t`Apply`}
        </Button>
        <Button variant="subtle" color="text-medium" onClick={onCloseFilter}>
          {t`Close`}
        </Button>
      </Group>
    </Stack>
  );
};
