import React from "react";

import { t, jt } from "c-3po";
import cx from "classnames";

import Popover from "metabase/components/Popover";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import Clause from "./Clause";
import ClauseDropTarget from "./dnd/ClauseDropTarget";
import DropTargetEmptyState from "./DropTargetEmptyState";
import AddClauseWidget from "./AddClauseWidget";
import AddClauseEmptyState from "./AddClauseEmptyState";

import FieldName from "../FieldName";
import BreakoutName from "../BreakoutName";
import BreakoutPopover from "../BreakoutPopover";
import AggregationName from "../AggregationName";
import AggregationPopover from "../AggregationPopover";

import WorksheetSection, {
  WorksheetSectionSubHeading,
} from "./WorksheetSection";

import SECTIONS from "./style";

const COLOR = SECTIONS.summarize.color;

const LAYOUT_HORIZONTAL = false;

class SummarizeSection extends React.Component {
  state = {
    newAggregationDimension: null,
  };
  render() {
    const { query, setDatasetQuery, style, className, onClear } = this.props;
    const { newAggregationDimension } = this.state;
    const aggregations = query.aggregations();
    const breakouts = query.breakouts();
    return (
      <WorksheetSection
        {...SECTIONS.summarize}
        style={style}
        className={className}
        onClear={() => {
          query
            .clearAggregations()
            .clearBreakouts()
            .update(setDatasetQuery);
          onClear();
        }}
      >
        <div
          className={cx("Grid Grid--full Grid--gutters", {
            "md-Grid--1of2": LAYOUT_HORIZONTAL,
          })}
        >
          <div className="Grid-cell">
            <WorksheetSectionSubHeading
            >{t`Metrics`}</WorksheetSectionSubHeading>
            <ClauseDropTarget
              color={COLOR}
              canDrop={dimension => {
                return dimension.aggregations().length > 0;
              }}
              onDrop={dimension =>
                this.setState({ newAggregationDimension: dimension })
              }
            >
              {aggregations.length > 0 ? (
                aggregations
                  .map((aggregation, index) => (
                    <AggregationWidget
                      aggregation={aggregation}
                      index={index}
                      query={query}
                      setDatasetQuery={setDatasetQuery}
                    />
                  ))
                  .concat(
                    <AddClauseWidget color={COLOR}>
                      <AggregationPopover
                        query={query}
                        onCommitAggregation={aggregation =>
                          query
                            .addAggregation(aggregation)
                            .update(setDatasetQuery)
                        }
                      />
                    </AddClauseWidget>,
                  )
              ) : !newAggregationDimension ? (
                <AddClauseEmptyState message="Add a metric">
                  <AggregationPopover
                    query={query}
                    onCommitAggregation={aggregation =>
                      query.addAggregation(aggregation).update(setDatasetQuery)
                    }
                  />
                </AddClauseEmptyState>
              ) : null}
              {newAggregationDimension && (
                <AggregationWidgetNew
                  dimension={newAggregationDimension}
                  query={query}
                  setDatasetQuery={setDatasetQuery}
                  onRemove={() =>
                    this.setState({ newAggregationDimension: null })
                  }
                />
              )}
            </ClauseDropTarget>
          </div>
          <div className="Grid-cell">
            <WorksheetSectionSubHeading
            >{t`Groupings`}</WorksheetSectionSubHeading>
            <ClauseDropTarget
              color={COLOR}
              onDrop={dimension => {
                query
                  .addBreakout(dimension.defaultBreakout())
                  .update(setDatasetQuery);
              }}
            >
              {breakouts.length > 0 ? (
                breakouts
                  .map((breakout, index) => (
                    <BreakoutWidget
                      breakout={breakout}
                      index={index}
                      query={query}
                      setDatasetQuery={setDatasetQuery}
                    />
                  ))
                  .concat(
                    query.canAddBreakout() && (
                      <AddClauseWidget color={COLOR}>
                        <BreakoutPopover
                          query={query}
                          onCommitBreakout={breakout =>
                            query.addBreakout(breakout).update(setDatasetQuery)
                          }
                        />
                      </AddClauseWidget>
                    ),
                  )
              ) : (
                <AddClauseEmptyState message="Add a breakout">
                  <BreakoutPopover
                    query={query}
                    onCommitBreakout={breakout =>
                      query.addBreakout(breakout).update(setDatasetQuery)
                    }
                  />
                </AddClauseEmptyState>
              )}
            </ClauseDropTarget>
          </div>
        </div>
      </WorksheetSection>
    );
  }
}

import { DimensionPicker } from "../FieldList";

const BreakoutWidget = ({ breakout, index, query, setDatasetQuery }) => {
  const dimension = query.breakoutDimensions()[index];
  const subDimensions = dimension.dimensions();

  const trigger = (
    <Clause
      color={COLOR}
      onRemove={() => query.removeBreakout(index).update(setDatasetQuery)}
    >
      <BreakoutName breakout={breakout} query={query} />
    </Clause>
  );

  if (subDimensions.length > 0) {
    return (
      <PopoverWithTrigger triggerElement={trigger}>
        {({ onClose }) => (
          <DimensionPicker
            style={{ color: COLOR }}
            dimension={dimension}
            dimensions={subDimensions}
            onChangeDimension={dimension => {
              query
                .updateBreakout(index, dimension.mbql())
                .update(setDatasetQuery);
              onClose();
            }}
          />
        )}
      </PopoverWithTrigger>
    );
  } else {
    return trigger;
  }
};

const AggregationWidget = ({ aggregation, index, query, setDatasetQuery }) => (
  <PopoverWithTrigger
    triggerElement={
      <Clause
        color={COLOR}
        onRemove={() => query.removeAggregation(index).update(setDatasetQuery)}
      >
        <AggregationName aggregation={aggregation} query={query} />
      </Clause>
    }
  >
    <AggregationPopover
      aggregation={aggregation}
      onCommitAggregation={aggregation =>
        query.updateAggregation(index, aggregation).update(setDatasetQuery)
      }
      query={query}
    />
  </PopoverWithTrigger>
);

const AggregationWidgetNew = ({
  dimension,
  query,
  setDatasetQuery,
  onRemove,
}) => (
  <Clause color={COLOR}>
    <FieldName field={dimension.mbql()} query={query} />
    <Popover isOpen onClose={onRemove}>
      <AggregationPopover
        dimension={dimension}
        query={query}
        onCommitAggregation={aggregation => {
          query.addAggregation(aggregation).update(setDatasetQuery);
        }}
        onClose={onRemove}
      />
    </Popover>
  </Clause>
);

export default SummarizeSection;
