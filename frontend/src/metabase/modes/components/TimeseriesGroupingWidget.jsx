import React, { Component } from "react";
import PropTypes from "prop-types";

import _ from "underscore";

import { isStructured } from "metabase/lib/query";

import TimeGroupingPopover from "metabase/query_builder/components/TimeGroupingPopover";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SelectButton from "metabase/components/SelectButton";

// set the display automatically then run
function updateAndRun(query) {
  query
    .question()
    .setDefaultDisplay()
    .update(null, { run: true });
}

export default class TimeseriesGroupingWidget extends Component {
  static propTypes = {
    query: PropTypes.object.isRequired,
  };

  _popover: ?any;

  render() {
    const { query } = this.props;

    if (isStructured(query.datasetQuery())) {
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
                updateAndRun(query.updateBreakout(index, dimension.mbql()));
              } else {
                updateAndRun(query.clearBreakouts().breakout(dimension.mbql()));
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
