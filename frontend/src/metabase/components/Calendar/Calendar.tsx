import { Component } from "react";
import cx from "classnames";
import moment, { Moment } from "moment-timezone";
import { Icon } from "metabase/core/components/Icon";
import {
  getDayOfWeekOptions,
  getFirstDayOfWeekIndex,
} from "metabase/lib/date-time";

import "./Calendar.css";
import { CalendarDay } from "./Calendar.styled";

export type SelectAll = "after" | "before";

export type CalendarProps = {
  initial?: Moment;
  selected?: Moment;
  selectedEnd?: Moment;
  selectAll?: SelectAll | null;
  onChange?: (
    start: string,
    end: string | null,
    startMoment: Moment,
    endMoment?: Moment | null,
  ) => void;
  onChangeDate?: (date: string, dateMoment: Moment) => void;
  isRangePicker?: boolean;
  primaryColor?: string;
};

type State = {
  current?: Moment;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class Calendar extends Component<CalendarProps, State> {
  constructor(props: CalendarProps) {
    super(props);
    this.state = {
      current: moment(props.initial || undefined),
    };
  }

  static defaultProps = {
    isRangePicker: true,
  };

  UNSAFE_componentWillReceiveProps(nextProps: CalendarProps) {
    if (
      // `selected` became null or not null
      (nextProps.selected == null) !== (this.props.selected == null) ||
      // `selectedEnd` became null or not null
      (nextProps.selectedEnd == null) !== (this.props.selectedEnd == null) ||
      // `selected` is not null and doesn't match previous `selected`
      (nextProps.selected != null &&
        !moment(nextProps.selected).isSame(this.props.selected, "day")) ||
      // `selectedEnd` is not null and doesn't match previous `selectedEnd`
      (nextProps.selectedEnd != null &&
        !moment(nextProps.selectedEnd).isSame(this.props.selectedEnd, "day"))
    ) {
      let resetCurrent = false;
      if (nextProps.selected != null && nextProps.selectedEnd != null) {
        // reset if `current` isn't between `selected` and `selectedEnd` month
        resetCurrent =
          nextProps.selected.isAfter(this.state.current, "month") &&
          nextProps.selectedEnd.isBefore(this.state.current, "month");
      } else if (nextProps.selected != null) {
        // reset if `current` isn't in `selected` month
        resetCurrent =
          nextProps.selected.isAfter(this.state.current, "month") ||
          nextProps.selected.isBefore(this.state.current, "month");
      }
      if (resetCurrent) {
        this.setState({ current: nextProps.selected });
      }
    }
  }

  onClickDay = (date: Moment) => {
    const { selected, selectedEnd, isRangePicker } = this.props;

    if (!isRangePicker || !selected || selectedEnd) {
      this.props.onChange?.(date.format("YYYY-MM-DD"), null, date, null);
    } else if (!selectedEnd) {
      if (date.isAfter(selected)) {
        this.props.onChange?.(
          selected.format("YYYY-MM-DD"),
          date.format("YYYY-MM-DD"),
          selected,
          date,
        );
      } else {
        this.props.onChange?.(
          date.format("YYYY-MM-DD"),
          selected.format("YYYY-MM-DD"),
          date,
          selected,
        );
      }
    }

    this.props.onChangeDate?.(date.format("YYYY-MM-DD"), date);
  };

  previous = () => {
    this.setState({ current: moment(this.state.current).add(-1, "M") });
  };

  next = () => {
    this.setState({ current: moment(this.state.current).add(1, "M") });
  };

  renderMonthHeader(current?: Moment, side?: "left" | "right") {
    current = current || moment();
    return (
      <div className="Calendar-header flex align-center border-bottom">
        {side !== "right" && (
          <div
            className="cursor-pointer text-brand-hover"
            onClick={this.previous}
          >
            <Icon name="chevronleft" size={10} />
          </div>
        )}
        <span className="flex-full" />
        <h4>{current.format("MMMM YYYY")}</h4>
        <span className="flex-full" />
        {side !== "left" && (
          <div className="cursor-pointer text-brand-hover" onClick={this.next}>
            <Icon name="chevronright" size={10} />
          </div>
        )}
      </div>
    );
  }

  renderDayNames() {
    const days = getDayOfWeekOptions();

    return (
      <div className="Calendar-day-names Calendar-week py1">
        {days.map(({ shortName }) => (
          <span
            key={shortName}
            className="Calendar-day-name text-centered"
            data-testid="calendar-day-name"
          >
            {shortName}
          </span>
        ))}
      </div>
    );
  }

  renderWeeks(current?: Moment) {
    current = current || moment();
    const weeks = [];
    const firstDayOfWeek = getFirstDayOfWeekIndex();
    const date = moment(current).startOf("month").isoWeekday(firstDayOfWeek);

    // if set week doesn't start with 1st day of month, then add the previous week
    if (date.date() > 1) {
      date.add(-1, "w");
    }

    let done = false;
    let monthIndex = date.month();
    let count = 0;

    while (!done) {
      weeks.push(
        <Week
          key={date.toString()}
          date={moment(date)}
          month={current}
          onClickDay={this.onClickDay}
          isRangePicker={this.props.isRangePicker}
          selected={this.props.selected}
          primaryColor={this.props.primaryColor}
          selectedEnd={this.props.selectedEnd}
          selectAll={this.props.selectAll}
        />,
      );
      date.add(1, "w");
      done = count++ > 2 && monthIndex !== date.month();
      monthIndex = date.month();
    }

    return (
      <div className="Calendar-weeks relative" data-testid="calendar-weeks">
        {weeks}
      </div>
    );
  }

  renderCalender(current?: Moment, side?: "left" | "right") {
    return (
      <div
        data-testid="calendar"
        className={cx("Calendar", {
          "Calendar--range":
            (this.props.isRangePicker &&
              this.props.selected &&
              this.props.selectedEnd) ||
            this.props.selectAll,
        })}
      >
        {this.renderMonthHeader(current, side)}
        {this.renderDayNames()}
        {this.renderWeeks(current)}
      </div>
    );
  }

  render() {
    const { current } = this.state;
    return this.renderCalender(current);
  }
}

type WeekProps = {
  date: Moment;
  month: Moment;
  selected?: Moment;
  selectedEnd?: Moment;
  selectAll?: SelectAll | null;
  isRangePicker?: boolean;
  primaryColor?: string;
  onClickDay: (date: Moment) => void;
};

class Week extends Component<WeekProps> {
  render() {
    const days = [];
    let { date, month, selected, selectedEnd, selectAll, isRangePicker } =
      this.props;

    for (let i = 0; i < 7; i++) {
      const isSelected =
        date.isSame(selected, "day") ||
        (isRangePicker &&
          selectedEnd?.isAfter(selected) &&
          date.isSame(selectedEnd, "day"));
      let isInRange = false;
      if (
        selected &&
        date.isAfter(selected, "day") &&
        selectedEnd &&
        selectedEnd.isAfter(date, "day")
      ) {
        isInRange = true;
      } else if (selectAll === "after") {
        isInRange = !!(selected && date.isAfter(selected, "day"));
      } else if (selectAll === "before") {
        isInRange = !!(selected && selected.isAfter(date, "day"));
      }
      const isEnd = selectAll === "before" && date.isSame(selected, "day");
      const isSelectedStart =
        !isEnd && selected && date.isSame(selected, "day");
      const isSelectedEnd =
        isEnd || (selectedEnd && date.isSame(selectedEnd, "day"));
      const classes = cx("Calendar-day cursor-pointer text-centered", {
        "Calendar-day--this-month": date.month() === month.month(),
        "Calendar-day--selected": isSelectedStart,
        "Calendar-day--selected-end": isSelectedEnd,
        "Calendar-day--week-start": i === 0,
        "Calendar-day--week-end": i === 6,
        "Calendar-day--in-range":
          (selectAll && isInRange) ||
          (!(date.isSame(selected, "day") || date.isSame(selectedEnd, "day")) &&
            (date.isSame(selected, "day") ||
              date.isSame(selectedEnd, "day") ||
              (selectedEnd &&
                selectedEnd.isAfter(date, "day") &&
                date.isAfter(selected, "day")))),
      });
      days.push(
        <CalendarDay
          key={date.toString()}
          className={classes}
          onClick={this.props.onClickDay.bind(null, date)}
          isInRange={isInRange}
          isSelected={isSelected}
          isSelectedStart={isSelectedStart}
          isSelectedEnd={isSelectedEnd}
          primaryColor={this.props.primaryColor}
        >
          {date.date()}
        </CalendarDay>,
      );
      date = moment(date).add(1, "d");
    }

    return (
      <div className="Calendar-week" key={days[0].toString()}>
        {days}
      </div>
    );
  }
}
