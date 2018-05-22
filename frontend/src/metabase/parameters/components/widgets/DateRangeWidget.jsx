import React, { Component } from "react";
import PropTypes from "prop-types";

import Calendar from "metabase/components/Calendar.jsx";
import moment from "moment";

const SEPARATOR = "~"; // URL-safe

function parseDateRangeValue(value) {
  const [start, end] = (value || "").split(SEPARATOR);
  return { start, end };
}
function serializeDateRangeValue({ start, end }) {
  return [start, end].join(SEPARATOR);
}

export default class DateRangeWidget extends Component {
  constructor(props, context) {
    super(props, context);
    this.state = parseDateRangeValue(props.value);
  }

  static propTypes = {
    value: PropTypes.string,
    setValue: PropTypes.func.isRequired,
  };
  static defaultProps = {};

  static format = value => {
    const { start, end } = parseDateRangeValue(value);
    return start && end
      ? moment(start).format("MMMM D, YYYY") +
          " - " +
          moment(end).format("MMMM D, YYYY")
      : "";
  };

  componentWillReceiveProps(nextProps) {
    if (nextProps.value !== this.props.value) {
      this.setState(parseDateRangeValue(nextProps.value));
    }
  }

  render() {
    const { start, end } = this.state;
    return (
      <div className="p1">
        <Calendar
          initial={start ? moment(start) : null}
          selected={start ? moment(start) : null}
          selectedEnd={end ? moment(end) : null}
          onChange={(start, end) => {
            if (end == null) {
              this.setState({ start, end });
            } else {
              this.props.setValue(serializeDateRangeValue({ start, end }));
            }
          }}
        />
      </div>
    );
  }
}
