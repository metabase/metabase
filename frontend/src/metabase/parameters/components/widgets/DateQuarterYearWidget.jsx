import React, { Component } from "react";

import YearPicker from "./YearPicker";

import moment from "moment";
import _ from "underscore";
import cx from "classnames";
import { t } from "ttag";

// translator: this is a "moment" format string (https://momentjs.com/docs/#/displaying/format/) It should include "Q" for the quarter number, and raw text can be escaped by brackets. For eample "[Quarter] Q" will be rendered as "Quarter 1" etc
const QUARTER_FORMAT_STRING = t`[Q]Q`;

export default class DateQuarterYearWidget extends Component {
  constructor(props, context) {
    super(props, context);

    const initial = moment(this.props.value, "[Q]Q-YYYY");
    if (initial.isValid()) {
      this.state = {
        quarter: initial.quarter(),
        year: initial.year(),
      };
    } else {
      this.state = {
        quarter: null,
        year: moment().year(),
      };
    }
  }

  static propTypes = {};
  static defaultProps = {};

  static format = value => {
    const m = moment(value, "[Q]Q-YYYY");
    return m.isValid() ? m.format("[Q]Q, YYYY") : "";
  };

  componentWillUnmount() {
    const { quarter, year } = this.state;
    if (quarter != null && year != null) {
      const value = moment()
        .year(year)
        .quarter(quarter)
        .format("[Q]Q-YYYY");
      if (this.props.value !== value) {
        this.props.setValue(value);
      }
    }
  }

  render() {
    const { onClose } = this.props;
    const { quarter, year } = this.state;
    return (
      <div className="py2">
        <div className="flex flex-column align-center px1">
          <YearPicker
            value={year}
            onChange={year => this.setState({ year: year })}
          />
        </div>
        <ol
          className="flex flex-wrap bordered mx2 text-bold rounded"
          style={{ width: 150 }}
        >
          {_.range(1, 5).map(q => (
            <Quarter
              quarter={q}
              selected={q === quarter}
              onClick={() => this.setState({ quarter: q }, onClose)}
            />
          ))}
        </ol>
      </div>
    );
  }
}

const Quarter = ({ quarter, selected, onClick }) => (
  <li
    className={cx(
      "cursor-pointer bg-brand-hover text-white-hover flex layout-centered",
      { "bg-brand text-white": selected },
    )}
    style={{ width: 75, height: 75 }}
    onClick={onClick}
  >
    {moment()
      .quarter(quarter)
      .format(QUARTER_FORMAT_STRING)}
  </li>
);
