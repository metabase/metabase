import React from "react";
import { t } from "ttag";
import cx from "classnames";
import { Flex } from "grid-styled";

import styled from "styled-components";

import colors, { alpha } from "metabase/lib/colors";

import SidebarContent from "metabase/query_builder/components/view/SidebarContent";
import AggregationPopover from "metabase/query_builder/components/AggregationPopover";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
import AggregationName from "metabase/query_builder/components/AggregationName";

import DimensionList from "metabase/query_builder/components/DimensionList";

import SelectButton from "metabase/components/SelectButton";
import Button from "metabase/components/Button";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";

// set the display automatically then run
function updateAndRun(query) {
  query
    .question()
    .setDisplayDefault()
    .update(null, { run: true });
}

export default function SummarizeSidebar({
  question,
  isResultDirty,
  runQuestionQuery,
  onClose,
  className,
}) {
  // topLevelQuery ignores any query stages that don't aggregate, e.x. post-aggregation filters
  const query = question.query().topLevelQuery();
  return (
    <SidebarContent
      title={t`Pick what you want to view`}
      onClose={() => {
        if (isResultDirty) {
          runQuestionQuery();
        }
        onClose();
      }}
      className={cx(className, "spread")}
    >
      <div className="px4 pt1">
        {query.aggregations().map((aggregation, index) => (
          <SummarizeAggregation
            className="mb1"
            key={index}
            aggregation={aggregation}
            index={index}
            query={query}
          />
        ))}
        <SummarizeAggregationAdd query={query} />
      </div>
      {query.hasAggregations() && (
        <div className="border-top mt3 pt3 mx1">
          <h3 className="text-heavy mb2 ml3">Summarize by…</h3>
          <SummarizeBreakouts className="mx2" query={query} />
        </div>
      )}
    </SidebarContent>
  );
}

const SummarizeAggregation = ({ className, aggregation, index, query }) => {
  return (
    <div className={cx(className, "flex align-stretch")}>
      <PopoverWithTrigger
        triggerClasses="flex-full"
        triggerElement={
          <AggregationToken color={colors["accent1"]}>
            <AggregationName className="ml1" aggregation={aggregation} />
            <Icon
              className="flex ml-auto faded fade-in-hover"
              name="close"
              onClick={() => {
                updateAndRun(query.removeAggregation(index));
              }}
            />
          </AggregationToken>
        }
      >
        {({ onClose }) => (
          <AggregationPopover
            query={query}
            aggregation={aggregation}
            onChangeAggregation={newAggregation => {
              updateAndRun(query.updateAggregation(index, newAggregation));
              onClose();
            }}
            onClose={onClose}
            alwaysExpanded
            showCustom={false}
          />
        )}
      </PopoverWithTrigger>
    </div>
  );
};

const AggregationToken = styled(Flex).attrs({
  align: "center",
  children: ({ icon, children }) => [
    icon && <Icon name={icon} size={12} />,
    children,
  ],
})`
  font-weight: bold;
  border: 2px solid transparent;
  border-radius: 6px;
  color: ${props => (props.inactive ? props.color : "white")};
  background-color: ${props => (props.inactive ? "transparent" : props.color)};
  border-color: ${props =>
    props.inactive ? alpha(props.color, 0.25) : "transparent"};
  &:hover {
    background-color: ${props => !props.inactive && alpha(props.color, 0.8)};
    border-color: ${props => props.inactive && alpha(props.color, 0.8)};
  }
  transition: background 300ms linear, border 300ms linear;
`;
AggregationToken.defaultProps = {
  p: 1,
  mr: 0,
};

const SummarizeAggregationAdd = ({ className, query }) => {
  return (
    <PopoverWithTrigger
      triggerClasses={cx(className, "flex")}
      triggerElement={
        <Flex
          py={10}
          px2
          mt2
          className="flex-full align-center rounded bg-light bg-medium-hover text-green text-bold transition-all"
        >
          <Icon className="ml2 mr1" name="add" size="10" />
          <span className="text-small">Add a metric</span>
        </Flex>
      }
      isInitiallyOpen={!query.hasAggregations()}
    >
      {({ onClose }) => (
        <AggregationPopover
          query={query}
          onChangeAggregation={newAggregation => {
            updateAndRun(query.addAggregation(newAggregation));
            onClose();
          }}
          onClose={onClose}
          alwaysExpanded
          showCustom={false}
        />
      )}
    </PopoverWithTrigger>
  );
};

const SummarizeBreakouts = ({ className, query }) => {
  const dimensions = query.breakouts().map(b => b.dimension());
  return (
    <DimensionList
      className="text-green mx2"
      dimensions={dimensions}
      sections={query.breakoutOptions(true).sections()}
      onChangeDimension={dimension => {
        updateAndRun(query.clearBreakouts().addBreakout(dimension.mbql()));
      }}
      onAddDimension={dimension => {
        updateAndRun(query.addBreakout(dimension.mbql()));
      }}
      onRemoveDimension={dimension => {
        for (const [index, existing] of dimensions.entries()) {
          if (dimension.isSameBaseDimension(existing)) {
            updateAndRun(query.removeBreakout(index));
            return;
          }
        }
      }}
      alwaysExpanded
      width={null}
      maxHeight={Infinity}
      enableSubDimensions
    />
  );
};
