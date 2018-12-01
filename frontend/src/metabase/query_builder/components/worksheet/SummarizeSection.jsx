import React from "react";

import { t, jt } from "c-3po";

import Clause from "./Clause";
import ClauseDropTarget from "./dnd/ClauseDropTarget";
import DropTargetEmptyState from "./DropTargetEmptyState";

import Breakout from "../Breakout";

import WorksheetSection, {
  WorksheetSectionSubHeading,
} from "./WorksheetSection";

import SECTIONS from "./style";

const SummarizeSection = ({ query, setDatasetQuery, style, className }) => {
  const aggregations = query.aggregations();
  const breakouts = query.breakouts();
  const color = SECTIONS.summarize.color;
  return (
    <WorksheetSection
      {...SECTIONS.summarize}
      style={style}
      className={className}
    >
      <div className="Grid Grid--full md-Grid--1of2">
        <div className="Grid-cell pr2">
          <WorksheetSectionSubHeading>{t`Metrics`}</WorksheetSectionSubHeading>
          <ClauseDropTarget color={color}>
            {aggregations.length > 0 ? (
              aggregations.map((aggregation, index) => (
                <Clause
                  color={color}
                  onRemove={() =>
                    query.removeAggregation(index).update(setDatasetQuery)
                  }
                >
                  {JSON.stringify(aggregation)}
                </Clause>
              ))
            ) : (
              <DropTargetEmptyState
                message={jt`Drag a column here to ${(
                  <strong>{t`summarize`}</strong>
                )} it`}
              />
            )}
          </ClauseDropTarget>
        </div>
        <div className="Grid-cell pl2">
          <WorksheetSectionSubHeading
          >{t`Dimensions`}</WorksheetSectionSubHeading>
          <ClauseDropTarget
            color={color}
            onDrop={dimension =>
              query.addBreakout(dimension.mbql()).update(setDatasetQuery)
            }
          >
            {breakouts.length > 0 ? (
              breakouts.map((breakout, index) => (
                <Clause
                  color={color}
                  onRemove={() =>
                    query.removeBreakout(index).update(setDatasetQuery)
                  }
                >
                  <Breakout breakout={breakout} query={query} />
                </Clause>
              ))
            ) : (
              <DropTargetEmptyState
                message={jt`Drag a column here to ${(
                  <strong>{t`group`}</strong>
                )} it`}
              />
            )}
          </ClauseDropTarget>
        </div>
      </div>
    </WorksheetSection>
  );
};

export default SummarizeSection;
