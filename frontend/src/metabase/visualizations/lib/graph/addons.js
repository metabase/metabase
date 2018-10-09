/* @flow weak */

import dc from "dc";
import moment from "moment";

export const lineAddons = _chart => {
  _chart.fadeDeselectedArea = function() {
    let dots = _chart.chartBodyG().selectAll(".dot");
    let extent = _chart.brush().extent();

    if (_chart.isOrdinal()) {
      if (_chart.hasFilter()) {
        dots.classed(dc.constants.SELECTED_CLASS, function(d) {
          return _chart.hasFilter(d.x);
        });
        dots.classed(dc.constants.DESELECTED_CLASS, function(d) {
          return !_chart.hasFilter(d.x);
        });
      } else {
        dots.classed(dc.constants.SELECTED_CLASS, false);
        dots.classed(dc.constants.DESELECTED_CLASS, false);
      }
    } else {
      if (!_chart.brushIsEmpty(extent)) {
        let start = extent[0];
        let end = extent[1];
        const isSelected = d => {
          if (moment.isDate(start)) {
            return !(moment(d.x).isBefore(start) || moment(d.x).isAfter(end));
          } else {
            return !(d.x < start || d.x >= end);
          }
        };
        dots.classed(dc.constants.DESELECTED_CLASS, d => !isSelected(d));
        dots.classed(dc.constants.SELECTED_CLASS, d => isSelected(d));
      } else {
        dots.classed(dc.constants.DESELECTED_CLASS, false);
        dots.classed(dc.constants.SELECTED_CLASS, false);
      }
    }
  };

  return _chart;
};
