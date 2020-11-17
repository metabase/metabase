import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Popover from "metabase/components/Popover";

import Clearable from "./Clearable";
import AggregationPopover from "./AggregationPopover";

// NOTE: lots of duplication between AggregationWidget and BreakoutWidget

export default class AggregationWidget extends React.Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      isOpen: props.isInitiallyOpen || false,
    };
  }

  static propTypes = {
    aggregation: PropTypes.array,
    onChangeAggregation: PropTypes.func.isRequired,
    query: PropTypes.object.isRequired,
    isInitiallyOpen: PropTypes.bool,
    children: PropTypes.object,
    showRawData: PropTypes.bool,
  };

  handleChangeAggregation = value => {
    this.props.onChangeAggregation(value);
    this.handleClose();
  };

  handleOpen = () => {
    this.setState({ isOpen: true });
  };

  handleClose = () => {
    this.setState({ isOpen: false });
  };

  render() {
    const {
      aggregation,
      query = aggregation.query && aggregation.query(),
      children,
      className,
    } = this.props;
    console.log("aggregation", aggregation);

    const popover = this.state.isOpen && (
      <Popover onClose={this.handleClose}>
        <AggregationPopover
          query={query}
          aggregation={aggregation}
          onChangeAggregation={this.handleChangeAggregation}
          showMetrics={this.props.showMetrics}
        />
      </Popover>
    );
    const trigger = aggregation ? (
      <Clearable
        onClear={
          query.canRemoveAggregation()
            ? () => this.handleChangeAggregation(null)
            : null
        }
      >
        <span className={className}>
          {isRows(aggregation) ? t`Raw data` : aggregation.displayName()}
        </span>
      </Clearable>
    ) : (
      children
    );

    if (trigger) {
      return (
        <div onClick={this.handleOpen}>
          {trigger}
          {popover}
        </div>
      );
    } else {
      return null;
    }
  }
}

const isRows = aggregation => aggregation && aggregation[0] === "rows";
