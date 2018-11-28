import React from "react";

import { t, jt } from "c-3po";

import Clause, { ClauseContainer } from "./Clause";
import WorksheetSection, {
  WorksheetSectionSubHeading,
} from "./WorksheetSection";

import SECTIONS from "./style";

const SummarizeSection = ({ query, style, className }) => {
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
          <ClauseContainer color={color}>
            {aggregations.length > 0 ? (
              aggregations.map(aggregation => (
                <Clause color={color}>{JSON.stringify(aggregation)}</Clause>
              ))
            ) : (
              <div className="text-centered">{jt`Drag a column here to ${(
                <strong>{t`summarize`}</strong>
              )} it`}</div>
            )}
          </ClauseContainer>
        </div>
        <div className="Grid-cell pl2">
          <WorksheetSectionSubHeading
          >{t`Dimensions`}</WorksheetSectionSubHeading>
          <ClauseContainer color={color}>
            {breakouts.length > 0 ? (
              breakouts.map(breakout => (
                <Clause color={color}>{JSON.stringify(breakout)}</Clause>
              ))
            ) : (
              <div className="text-centered">{jt`Drag a column here to ${(
                <strong>{t`group`}</strong>
              )} it`}</div>
            )}
          </ClauseContainer>
        </div>
      </div>
    </WorksheetSection>
  );
};

export default SummarizeSection;
