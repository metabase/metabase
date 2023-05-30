import React, { Component } from "react";
import PropTypes from "prop-types";

import _ from "underscore";

import TimeGroupingPopover from "metabase/query_builder/components/TimeGroupingPopover";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import { SelectButton } from "metabase/core/components/SelectButton";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

export default class TimeseriesGroupingWidget extends Component {
  static propTypes = {
    query: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
  };

  _popover;

  render() {
    const { query, onChange } = this.props;

    if (query instanceof StructuredQuery) {
      const breakouts = query.breakouts();
      if (!breakouts || breakouts.length === 0) {
        return null;
      }
      const dimensions = breakouts.map(b => b.dimension());
      const dimension = dimensions[0];

      return (
        <PopoverWithTrigger
          triggerElement={
            <SelectButton hasValue>{dimension.subDisplayName()}</SelectButton>
          }
          triggerClasses="my2"
          ref={ref => (this._popover = ref)}
        >
          <TimeGroupingPopover
            title={null}
            className="text-brand"
            dimension={dimension}
            onChangeDimension={dimension => {
              const index = _.findIndex(dimensions, d =>
                d.isSameBaseDimension(dimension),
              );
              if (index >= 0) {
                const newQuestion = query
                  .updateBreakout(index, dimension.mbql())
                  .question()
                  .setDefaultDisplay();

                onChange(newQuestion);
              } else {
                const newQuestion = query
                  .clearBreakouts()
                  .breakout(dimension.mbql())
                  .question()
                  .setDefaultDisplay();

                onChange(newQuestion);
              }
              if (this._popover) {
                this._popover.close();
              }
            }}
          />
        </PopoverWithTrigger>
      );
    } else {
      return null;
    }
  }
}
