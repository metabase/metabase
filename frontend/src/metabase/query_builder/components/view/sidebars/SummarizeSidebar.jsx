import React from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";
import styled from "styled-components";

import { Flex } from "grid-styled";

import { color, alpha } from "metabase/lib/colors";

import SidebarContent from "metabase/query_builder/components/SidebarContent";
import AggregationPopover from "metabase/query_builder/components/AggregationPopover";

import DimensionList from "metabase/query_builder/components/DimensionList";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";

// set the display automatically then run
function updateAndRun(query) {
  query
    .question()
    .setDefaultDisplay()
    .update(null, { run: true });
}

export default class SummarizeSidebar extends React.Component {
  state = {
    modified: false,
  };

  componentWillReceiveProps(nextProps) {
    if (!this.props.question.isEqual(nextProps.question)) {
      this.setState({ modified: true });
    }
  }

  render() {
    const {
      question,
      isResultDirty,
      runQuestionQuery,
      onClose,
      className,
    } = this.props;
    // topLevelQuery ignores any query stages that don't aggregate, e.x. post-aggregation filters
    let query = question.query().topLevelQuery();
    // if the query hasn't been modified and doesn't have an aggregation, automatically add one
    const addDefaultAggregation =
      !this.state.modified && !query.hasAggregations();
    if (addDefaultAggregation) {
      query = query.aggregate(["count"]);
    }
    return (
      <SidebarContent
        title={t`Summarize by`}
        color={color("summarize")}
        onDone={() => {
          if (isResultDirty) {
            runQuestionQuery();
          } else if (addDefaultAggregation) {
            query.update(null, { run: true });
          }
          onClose();
        }}
        className={cx(className, "spread")}
      >
        <div className="px3">
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
            <h3 className="text-heavy mb2 ml2">{t`Group by`}</h3>
            <SummarizeBreakouts className="mx2" query={query} />
          </div>
        )}
      </SidebarContent>
    );
  }
}

const SummarizeAggregation = ({ className, aggregation, index, query }) => {
  return (
    <div className={cx(className, "flex align-stretch")}>
      <PopoverWithTrigger
        triggerClasses="flex-full"
        triggerElement={
          <AggregationToken color={color("summarize")}>
            <span className="ml1">{aggregation.displayName()}</span>
            {aggregation.canRemove() && (
              <Icon
                className="flex ml-auto faded fade-in-hover"
                name="close"
                onClick={() => {
                  updateAndRun(query.removeAggregation(index));
                }}
              />
            )}
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
          <span className="text-small">{t`Add a metric`}</span>
        </Flex>
      }
      isInitiallyOpen={!query.hasAggregations()}
    >
      {({ onClose }) => (
        <AggregationPopover
          query={query}
          onChangeAggregation={newAggregation => {
            updateAndRun(query.aggregate(newAggregation));
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
      className="text-green mx1"
      dimensions={dimensions}
      sections={query.breakoutOptions(true).sections()}
      onChangeDimension={dimension => {
        const index = _.findIndex(dimensions, d =>
          d.isSameBaseDimension(dimension),
        );
        if (index >= 0) {
          updateAndRun(query.updateBreakout(index, dimension.mbql()));
        } else {
          updateAndRun(query.clearBreakouts().breakout(dimension.mbql()));
        }
      }}
      onAddDimension={dimension => {
        updateAndRun(query.breakout(dimension.mbql()));
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
