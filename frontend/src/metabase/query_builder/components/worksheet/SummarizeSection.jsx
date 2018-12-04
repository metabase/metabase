import React from "react";

import { t, jt } from "c-3po";

import Popover from "metabase/components/Popover";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import Clause from "./Clause";
import ClauseDropTarget from "./dnd/ClauseDropTarget";
import DropTargetEmptyState from "./DropTargetEmptyState";
import AddClauseWidget from "./AddClauseWidget";

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
        <div className="Grid Grid--full md-Grid--1of2">
          <div className="Grid-cell pr2">
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
                aggregations.map((aggregation, index) => (
                  <AggregationWidget
                    aggregation={aggregation}
                    index={index}
                    query={query}
                    setDatasetQuery={setDatasetQuery}
                  />
                ))
              ) : !newAggregationDimension ? (
                <DropTargetEmptyState
                  message={jt`Drag a column here to ${(
                    <strong>{t`summarize`}</strong>
                  )} it`}
                />
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
              <AddClauseWidget color={COLOR}>
                <AggregationPopover
                  query={query}
                  onCommitAggregation={aggregation =>
                    query.addAggregation(aggregation).update(setDatasetQuery)
                  }
                />
              </AddClauseWidget>
            </ClauseDropTarget>
          </div>
          <div className="Grid-cell pl2">
            <WorksheetSectionSubHeading
            >{t`Dimensions`}</WorksheetSectionSubHeading>
            <ClauseDropTarget
              color={COLOR}
              onDrop={dimension => {
                query
                  .addBreakout(dimension.defaultBreakout())
                  .update(setDatasetQuery);
              }}
            >
              {breakouts.length > 0 ? (
                breakouts.map((breakout, index) => (
                  <BreakoutWidget
                    breakout={breakout}
                    index={index}
                    query={query}
                    setDatasetQuery={setDatasetQuery}
                  />
                ))
              ) : (
                <DropTargetEmptyState
                  message={jt`Drag a column here to ${(
                    <strong>{t`group`}</strong>
                  )} it`}
                />
              )}
              {query.canAddBreakout() && (
                <AddClauseWidget color={COLOR}>
                  <BreakoutPopover
                    query={query}
                    onCommitBreakout={breakout =>
                      query.addBreakout(breakout).update(setDatasetQuery)
                    }
                  />
                </AddClauseWidget>
              )}
            </ClauseDropTarget>
          </div>
        </div>
      </WorksheetSection>
    );
  }
}

const BreakoutWidget = ({ breakout, index, query, setDatasetQuery }) => (
  <PopoverWithTrigger
    triggerElement={
      <Clause
        color={COLOR}
        onRemove={() => query.removeBreakout(index).update(setDatasetQuery)}
      >
        <BreakoutName breakout={breakout} query={query} />
      </Clause>
    }
  >
    <BreakoutPopover
      breakout={breakout}
      onCommitBreakout={breakout =>
        query.updateBreakout(index, breakout).update(setDatasetQuery)
      }
      query={query}
    />
  </PopoverWithTrigger>
);

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
