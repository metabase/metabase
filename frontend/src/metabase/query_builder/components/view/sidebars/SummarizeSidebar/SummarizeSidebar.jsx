import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import { color } from "metabase/lib/colors";
import { usePrevious } from "metabase/hooks/use-previous";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import { updateAndRunQuery } from "./utils";
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
  onClose: PropTypes.func.isRequired,
  className: PropTypes.string,
};

const SummarizeSidebar = ({
  question,
  isResultDirty,
  runQuestionQuery,
  onClose,
  className,
}) => {
  const previousQuestion = usePrevious(question);
  const [isModified, setIsModified] = useState(false);

  // topLevelQuery ignores any query stages that don't aggregate, e.x. post-aggregation filters
  let query = question.query().topLevelQuery();
  // if the query hasn't been modified and doesn't have an aggregation, automatically add one
  const shouldAddDefaultAggregation = !isModified && !query.hasAggregations();
  if (shouldAddDefaultAggregation) {
    query = query.aggregate(["count"]);
  }
  const dimensions = query.breakouts().map(b => b.dimension());
  const sections = query.breakoutOptions(true).sections() ?? [];

  useEffect(() => {
    if (
      previousQuestion == null ||
      question.isEqual(previousQuestion, { compareResultsMetadata: false })
    ) {
      return;
    }

    setIsModified(true);
  }, [question, previousQuestion]);

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

  return (
    <SidebarContent
      title={t`Summarize by`}
      color={color("summarize")}
      onDone={() => {
        if (isResultDirty) {
          runQuestionQuery();
        } else if (shouldAddDefaultAggregation) {
          query.update(null, { run: true });
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
          />
        ))}
        <AddAggregationButton
          query={query}
          shouldShowLabel={!query.hasAggregations()}
        />
      </AggregationsContainer>

      {query.hasAggregations() && (
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
