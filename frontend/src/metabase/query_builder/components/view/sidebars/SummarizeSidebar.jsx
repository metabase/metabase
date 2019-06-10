import React from "react";
import { t } from "ttag";
import cx from "classnames";

import styled from "styled-components";

import colors from "metabase/lib/colors";

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

const AggregationSidebar = ({ question, index, onClose }) => {
  const query = question.query();
  return (
    <SidebarContent
      title={t`Summarize`}
      onClose={onClose}
      onDone={onClose}
      className="full-height"
    >
      <div className="px4 pt2">
        <SectionTitle className="mb2">Pick a metric to view</SectionTitle>
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
        <div className="border-top mt2 pt3 mx1">
          <SectionTitle className="mb1 ml3">Summarize by</SectionTitle>
          <SummarizeBreakouts className="mx2" query={query} />
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
            alwaysExpanded
            showCustom={false}
          />
        )}
      </PopoverWithTrigger>
      <Button
        borderless
        ml={1}
        icon="close"
        className="block text-light text-brand-hover"
        onClick={() => {
          updateAndRun(query.removeAggregation(index));
        }}
      />
    </div>
  );
};

const SummarizeAggregationAdd = ({ className, query }) => {
  return (
    <PopoverWithTrigger
      triggerClasses={cx(className, "flex")}
      triggerElement={
        <Button borderless icon="add" className="text-light text-brand-hover" />
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

const SectionTitle = styled.h3.attrs({ className: "text-medium" })``;

export default AggregationSidebar;
