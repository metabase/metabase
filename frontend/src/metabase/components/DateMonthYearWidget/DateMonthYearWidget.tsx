import { Component } from "react";
import moment from "moment-timezone";
import _ from "underscore";
import cx from "classnames";

import YearPicker from "metabase/components/YearPicker";

import { MonthContainer, MonthList } from "./DateMonthYearWidget.styled";

type Props = {
  value: string;
  setValue: (v: string) => void;
  onClose: () => void;
};

type State = {
  month: number | null;
  year: number;
};

class DateMonthYearWidget extends Component<Props, State> {
  state: State = {
    month: null,
    year: moment().year(),
  };

  constructor(props: Props) {
    super(props);

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

  componentWillUnmount() {
    const { month, year } = this.state;
    if (month != null && year != null) {
      const value = moment().year(year).month(month).format("YYYY-MM");
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
        <MonthList>
          {_.range(0, 12).map(m => (
            <MonthContainer key={m}>
              <Month
                month={m}
                selected={m === month}
                onClick={() => this.setState({ month: m }, onClose)}
              />
            </MonthContainer>
          ))}
        </MonthList>
      </div>
    );
  }
}

interface MonthProp {
  month: number;
  selected: boolean;
  onClick: () => void;
}

const Month = ({ month, selected, onClick }: MonthProp) => (
  <div
    aria-selected={selected}
    className={cx(
      "cursor-pointer text-bold full text-centered py1 px2 circular my1",
      {
        "bg-light-hover": !selected,
        "text-white bg-brand": selected,
      },
    )}
    onClick={onClick}
  >
    {moment().month(month).format("MMMM")}
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateMonthYearWidget;
