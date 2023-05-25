/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ControlledPopoverWithTrigger from "metabase/components/PopoverWithTrigger/ControlledPopoverWithTrigger";
import { isRows } from "metabase-lib/queries/utils/aggregation";
import Clearable from "./Clearable";
import AggregationPopover from "./AggregationPopover";
import { AggregationLabel } from "./AggregationWidget.styled";
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

    const trigger = aggregation ? (
      <Clearable
        onClear={
          query.canRemoveAggregation()
            ? () => this.handleChangeAggregation(null)
            : null
        }
      >
        <AggregationLabel className={className}>
          {isRows(aggregation) ? t`Raw data` : aggregation.displayName()}
        </AggregationLabel>
      </Clearable>
    ) : (
      children
    );

    if (!trigger) {
      return null;
    }

    return (
      <ControlledPopoverWithTrigger
        disableContentSandbox
        placement="bottom-start"
        maxWidth={450}
        visible={this.state.isOpen}
        onClose={this.handleClose}
        onOpen={this.handleOpen}
        triggerContent={trigger}
        popoverContent={
          <AggregationPopover
            query={query}
            aggregation={aggregation}
            onChangeAggregation={this.handleChangeAggregation}
            showMetrics={this.props.showMetrics}
          />
        }
      >
        {trigger}
      </ControlledPopoverWithTrigger>
    );
  }
}
