import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import Tooltip from "metabase/core/components/Tooltip";
import AggregationPopover from "metabase/query_builder/components/AggregationPopover";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { Icon } from "metabase/core/components/Icon";

import { AddAggregationButtonRoot } from "./AddAggregationButton.styled";

const propTypes = {
  query: PropTypes.object,
  shouldShowLabel: PropTypes.bool,
  updateAndRunQuery: PropTypes.func.isRequired,
};

const LABEL = t`Add a metric`;

export const AddAggregationButton = ({
  query,
  shouldShowLabel = false,
  updateAndRunQuery,
}) => {
  return (
    <PopoverWithTrigger
      triggerElement={
        <Tooltip tooltip={LABEL} isEnabled={!shouldShowLabel}>
          <AddAggregationButtonRoot data-testid="add-aggregation-button">
            <Icon
              name="add"
              className={cx({ mr1: shouldShowLabel })}
            />
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
    </PopoverWithTrigger >
  );
};

AddAggregationButton.propTypes = propTypes;
