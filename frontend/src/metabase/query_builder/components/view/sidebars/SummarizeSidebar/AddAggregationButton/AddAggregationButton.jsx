import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Tooltip from "metabase/components/Tooltip";
import AggregationPopover from "metabase/query_builder/components/AggregationPopover";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";

import { AddAggregationButtonRoot } from "./AddAggregationButton.styled";
import { updateAndRunQuery } from "../utils";

const propTypes = {
  query: PropTypes.object,
  shouldShowLabel: PropTypes.boolean,
};

const LABEL = t`Add a metric`;

export const AddAggregationButton = ({ query, shouldShowLabel = false }) => {
  return (
    <PopoverWithTrigger
      triggerElement={
        <Tooltip tooltip={LABEL} isEnabled={!shouldShowLabel}>
          <AddAggregationButtonRoot data-testid="add-aggregation-button">
            <Icon name="add" size="12" mr={shouldShowLabel ? 1 : "none"} />
            {shouldShowLabel ? LABEL : null}
          </AddAggregationButtonRoot>
        </Tooltip>
      }
      isInitiallyOpen={!query.hasAggregations()}
    >
      {({ onClose }) => (
        <AggregationPopover
          query={query}
          onChangeAggregation={newAggregation => {
            updateAndRunQuery(query.aggregate(newAggregation));
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

AddAggregationButton.propTypes = propTypes;
