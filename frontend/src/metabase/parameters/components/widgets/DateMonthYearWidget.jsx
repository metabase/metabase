import React from "react";
import YearPicker from "./YearPicker";
import { Flex } from "grid-styled";

import moment from "moment";
import _ from "underscore";
import cx from "classnames";

export default class DateMonthYearWidget extends React.Component {
  constructor(props, context) {
    super(props, context);

    const initial = moment(this.props.value, "YYYY-MM");
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
      const value = moment()
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
      <div style={{ maxWidth: 320 }}>
        <div className="border-bottom flex justify-center py1">
          <YearPicker
            value={year}
            onChange={year => this.setState({ year: year })}
          />
        </div>
        <Flex flexWrap="wrap" w="100%" p={1}>
          {_.range(0, 12).map(m => (
            <Flex w={1 / 3} align="center" justifyContent="center">
              <Month
                key={m}
                month={m}
                selected={m === month}
                onClick={() => this.setState({ month: m }, onClose)}
              />
            </Flex>
          ))}
        </Flex>
      </div>
    );
  }
}

const Month = ({ month, selected, onClick }) => (
  <div
    className={cx(
      "cursor-pointer text-bold full text-centered py1 px2 circular my1",
      {
        "bg-light-hover": !selected,
        "text-white bg-brand": selected,
      },
    )}
    onClick={onClick}
  >
    {moment()
      .month(month)
      .format("MMMM")}
  </div>
);
