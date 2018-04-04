import React, { Component } from "react";

import YearPicker from "./YearPicker.jsx";

import moment from "moment";
import _ from "underscore";
import cx from "classnames";

export default class DateMonthYearWidget extends Component {
  constructor(props, context) {
    super(props, context);

    let initial = moment(this.props.value, "YYYY-MM");
    if (initial.isValid()) {
      this.state = {
        month: initial.month(),
        year: initial.year(),
      };
    } else {
      this.state = {
        month: null,
        year: moment().year(),
      };
    }
  }

  static propTypes = {};
  static defaultProps = {};

  static format = value => {
    const m = moment(value, "YYYY-MM");
    return m.isValid() ? m.format("MMMM, YYYY") : "";
  };

  componentWillUnmount() {
    const { month, year } = this.state;
    if (month != null && year != null) {
      let value = moment()
        .year(year)
        .month(month)
        .format("YYYY-MM");
      if (this.props.value !== value) {
        this.props.setValue(value);
      }
    }
  }

  render() {
    const { onClose } = this.props;
    const { month, year } = this.state;
    return (
      <div className="py2">
        <div className="flex flex-column align-center px1">
          <YearPicker
            value={year}
            onChange={year => this.setState({ year: year })}
          />
        </div>
        <div className="flex">
          <ol className="flex flex-column">
            {_.range(0, 6).map(m => (
              <Month
                key={m}
                month={m}
                selected={m === month}
                onClick={() => this.setState({ month: m }, onClose)}
              />
            ))}
          </ol>
          <ol className="flex flex-column">
            {_.range(6, 12).map(m => (
              <Month
                key={m}
                month={m}
                selected={m === month}
                onClick={() => this.setState({ month: m }, onClose)}
              />
            ))}
          </ol>
        </div>
      </div>
    );
  }
}

const Month = ({ month, selected, onClick }) => (
  <li
    className={cx("cursor-pointer px3 py1 text-bold text-brand-hover", {
      "text-brand": selected,
    })}
    onClick={onClick}
  >
    {moment()
      .month(month)
      .format("MMMM")}
  </li>
);
