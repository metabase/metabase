import React from "react";
import { t } from "ttag";
import cx from "classnames";

import styled from "styled-components";

import colors from "metabase/lib/colors";

import SidebarContent from "metabase/query_builder/components/view/SidebarContent";
import AggregationPopover from "metabase/query_builder/components/AggregationPopover";
import BreakoutPopover from "metabase/query_builder/components/BreakoutPopover";
import AggregationName from "metabase/query_builder/components/AggregationName";

import SelectButton from "metabase/components/SelectButton";
import Button from "metabase/components/Button";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";

// set the display automatically then run
function updateAndRun(query) {
  query
    .question()
    .setDisplayAutomatically()
    .update(null, { run: true });
}

const AggregationSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  return (
    <SidebarContent
      title={t`Summarize`}
      onClose={onClose}
      onDone={onClose}
      className="full-height"
    >
      <div className="px4 pt3">
        <SectionTitle className="mb1">Pick a metric to view</SectionTitle>
        {query.aggregations().map((aggregation, index) => (
          <SummarizeAggregation
            className="mb1"
            key={index}
            aggregation={aggregation}
            index={index}
            query={query}
          />
        ))}
        <SummarizeAggregationAdd className="mb1" query={query} />
      </div>
      {query.hasAggregations() && (
        <div className="border-top mt2 pt2 ml1">
          <SectionTitle className="mb1 ml3">Summarize by</SectionTitle>
          <SummarizeBreakouts query={query} />
        </div>
      )}
    </SidebarContent>
  );
};

const SummarizeAggregation = ({ className, aggregation, index, query }) => {
  return (
    <div className={cx(className, "flex align-stretch")}>
      <PopoverWithTrigger
        triggerClasses="flex-full"
        triggerElement={
          <SelectButton className="full-height">
            <AggregationName aggregation={aggregation} />
          </SelectButton>
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
          />
        )}
      </PopoverWithTrigger>
      {/* {query.aggregations().length > 1 && ( */}
      <Button
        icon="close"
        className="block text-light ml1"
        onClick={() => {
          updateAndRun(query.removeAggregation(index));
        }}
      />
      {/* )} */}
    </div>
  );
};

const SummarizeAggregationAdd = ({ className, query }) => {
  return (
    <PopoverWithTrigger
      triggerClasses={cx(className, "flex")}
      triggerElement={<Button icon="add" className="text-light flex-full" />}
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
        />
      )}
    </PopoverWithTrigger>
  );
};

const SummarizeBreakouts = ({ className, query }) => {
  const breakouts = query.breakouts();
  return (
    <BreakoutPopover
      className={className}
      query={query}
      breakout={breakouts[0]}
      onChangeBreakout={breakout => {
        if (breakouts.length > 0) {
          updateAndRun(query.updateBreakout(0, breakout));
        } else {
          updateAndRun(query.addBreakout(breakout));
        }
      }}
      alwaysExpanded
      width={null}
      maxHeight={Infinity} // just implement scrolling ourselves
      searchable={false}
    />
  );
};

const SectionTitle = styled.h4.attrs({ className: "text-medium" })``;

export default AggregationSidebar;
