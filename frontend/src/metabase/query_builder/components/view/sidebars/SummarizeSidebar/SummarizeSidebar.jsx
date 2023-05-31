import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import { color } from "metabase/lib/colors";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import { AddAggregationButton } from "./AddAggregationButton";
import { AggregationItem } from "./AggregationItem";
import { DimensionList } from "./DimensionList";
import {
  SectionTitle,
  DimensionListContainer,
  AggregationsContainer,
} from "./SummarizeSidebar.styled";

const propTypes = {
  question: PropTypes.object,
  isResultDirty: PropTypes.bool,
  runQuestionQuery: PropTypes.func.isRequired,
  updateQuestion: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  className: PropTypes.string,
};

function getQuery(question, isDefaultAggregationRemoved) {
  const query = question.query().topLevelQuery();
  const shouldAddDefaultAggregation =
    !query.hasAggregations() && !isDefaultAggregationRemoved;
  return shouldAddDefaultAggregation ? query.aggregate(["count"]) : query;
}

const SummarizeSidebar = ({
  question,
  isResultDirty,
  runQuestionQuery,
  updateQuestion,
  onClose,
  className,
}) => {
  const [isDefaultAggregationRemoved, setDefaultAggregationRemoved] =
    useState(false);

  const [query, setQuery] = useState(
    getQuery(question, isDefaultAggregationRemoved),
  );

  const updateAndRunQuery = useCallback(
    query => {
      updateQuestion(query.question().setDefaultDisplay(), {
        run: true,
      });
    },
    [updateQuestion],
  );

  useEffect(() => {
    const nextQuery = getQuery(question, isDefaultAggregationRemoved);
    setQuery(nextQuery);
  }, [question, isDefaultAggregationRemoved]);

  const hasAggregations = query.hasAggregations();
  const topLevelQuery = question.query().topLevelQuery();
  const hasDefaultAggregation =
    !isDefaultAggregationRemoved && !topLevelQuery.hasAggregations();

  const dimensions = query.breakouts().map(b => b.dimension());
  const sections = query.breakoutOptions(true).sections() ?? [];

  const handleDimensionChange = dimension => {
    const index = dimensions.findIndex(d => d.isSameBaseDimension(dimension));
    if (index >= 0) {
      updateAndRunQuery(query.updateBreakout(index, dimension.mbql()));
    } else {
      updateAndRunQuery(query.clearBreakouts().breakout(dimension.mbql()));
    }
  };

  const handleDimensionAdd = dimension => {
    updateAndRunQuery(query.breakout(dimension.mbql()));
  };

  const handleDimensionRemove = dimension => {
    for (const [index, existing] of dimensions.entries()) {
      if (dimension.isSameBaseDimension(existing)) {
        updateAndRunQuery(query.removeBreakout(index));
        return;
      }
    }
  };

  const handleAggregationRemove = (aggregation, index) => {
    const lastAggregationRemoved = index === 0;
    if (lastAggregationRemoved) {
      setDefaultAggregationRemoved(true);
    }
  };

  return (
    <SidebarContent
      title={t`Summarize by`}
      color={color("summarize")}
      onDone={() => {
        if (isResultDirty) {
          runQuestionQuery();
        }
        if (hasDefaultAggregation) {
          updateQuestion(query.question(), { run: true });
        }
        onClose();
      }}
      className={cx(className, "spread")}
    >
      <AggregationsContainer>
        {query.aggregations().map((aggregation, index) => (
          <AggregationItem
            key={index}
            aggregation={aggregation}
            index={index}
            query={query}
            onRemove={handleAggregationRemove}
            updateAndRunQuery={updateAndRunQuery}
          />
        ))}
        <AddAggregationButton
          query={query}
          shouldShowLabel={!hasAggregations}
          updateAndRunQuery={updateAndRunQuery}
        />
      </AggregationsContainer>

      {hasAggregations && (
        <DimensionListContainer>
          <SectionTitle>{t`Group by`}</SectionTitle>

          <DimensionList
            queryTableId={query.tableId()}
            dimensions={dimensions}
            sections={sections}
            onChangeDimension={handleDimensionChange}
            onAddDimension={handleDimensionAdd}
            onRemoveDimension={handleDimensionRemove}
          />
        </DimensionListContainer>
      )}
    </SidebarContent>
  );
};

SummarizeSidebar.propTypes = propTypes;

export default SummarizeSidebar;
