import cx from "classnames";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import {
  getDayOfWeekOptions,
  getFirstDayOfWeekIndex,
} from "metabase/lib/date-time";
import { Icon } from "metabase/ui";

import CalendarS from "./Calendar.module.css";
import { CalendarDay, CalendarIconContainer } from "./Calendar.styled";

export type SelectAll = "after" | "before";

export type CalendarProps = {
  initial?: Dayjs;
  selected?: Dayjs;
  selectedEnd?: Dayjs;
  selectAll?: SelectAll | null;
  onChange?: (
    start: string,
    end: string | null,
    startDate: Dayjs,
    endDate?: Dayjs | null,
  ) => void;
  onChangeDate?: (date: string, dateObj: Dayjs) => void;
  isRangePicker?: boolean;
  noContext?: boolean;
};

type State = {
  current?: Dayjs;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default class Calendar extends Component<CalendarProps, State> {
  constructor(props: CalendarProps) {
    super(props);
    this.state = {
      current: dayjs(props.initial),
    };
  }

  static defaultProps = {
    isRangePicker: true,
    noContext: false,
  };

  UNSAFE_componentWillReceiveProps(nextProps: CalendarProps) {
    if (
      // `selected` became null or not null
      (nextProps.selected == null) !== (this.props.selected == null) ||
      // `selectedEnd` became null or not null
      (nextProps.selectedEnd == null) !== (this.props.selectedEnd == null) ||
      // `selected` is not null and doesn't match previous `selected`
      (nextProps.selected != null &&
        !dayjs(nextProps.selected).isSame(this.props.selected, "day")) ||
      // `selectedEnd` is not null and doesn't match previous `selectedEnd`
      (nextProps.selectedEnd != null &&
        !dayjs(nextProps.selectedEnd).isSame(this.props.selectedEnd, "day"))
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

  onClickDay = (date: Dayjs) => {
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
    this.setState({ current: dayjs(this.state.current).subtract(1, "month") });
  };

  next = () => {
    this.setState({ current: dayjs(this.state.current).add(1, "month") });
  };

  renderMonthHeader(current?: Dayjs, side?: "left" | "right") {
    current = current || dayjs();
    return (
      <div
        className={cx(
          CalendarS.CalendarHeader,
          CS.flex,
          CS.alignCenter,
          CS.borderBottom,
        )}
      >
        {side !== "right" && (
          <CalendarIconContainer onClick={this.previous}>
            <Icon name="chevronleft" size={10} />
          </CalendarIconContainer>
        )}
        <span className={CS.flexFull} />
        <h4>{current.format("MMMM YYYY")}</h4>
        <span className={CS.flexFull} />
        {side !== "left" && (
          <CalendarIconContainer onClick={this.next}>
            <Icon name="chevronright" size={10} />
          </CalendarIconContainer>
        )}
      </div>
    );
  }

  renderDayNames() {
    const days = getDayOfWeekOptions();

    return (
      <div
        className={cx(
          CalendarS.CalendarDayNames,
          CalendarS.CalendarWeek,
          CS.py1,
        )}
      >
        {days.map(({ shortName }) => (
          <span
            key={shortName}
            className={cx(CalendarS.CalendarDayName, CS.textCentered)}
            data-testid="calendar-day-name"
          >
            {shortName}
          </span>
        ))}
      </div>
    );
  }

  renderWeeks(current?: Dayjs) {
    current = current || dayjs();
    const weeks = [];
    const firstDayOfWeek = getFirstDayOfWeekIndex();
    let date = dayjs(current).startOf("month").day(firstDayOfWeek);

    // if set week doesn't start with 1st day of month, then add the previous week
    if (date.date() > 1) {
      date = date.subtract(1, "week");
    }

    let done = false;
    let monthIndex = date.month();
    let count = 0;

    while (!done) {
      weeks.push(
        <Week
          key={date.toString()}
          date={dayjs(date)}
          month={current}
          onClickDay={this.onClickDay}
          isRangePicker={this.props.isRangePicker}
          selected={this.props.selected}
          selectedEnd={this.props.selectedEnd}
          selectAll={this.props.selectAll}
          noContext={this.props.noContext}
        />,
      );
      date = date.add(1, "week");
      done = count++ > 2 && monthIndex !== date.month();
      monthIndex = date.month();
    }

    return (
      <div
        className={cx(CalendarS.CalendarWeeks, CS.relative)}
        data-testid="calendar-weeks"
      >
        {weeks}
      </div>
    );
  }

  renderCalendar(current?: Dayjs, side?: "left" | "right") {
    return (
      <div
        data-testid="calendar"
        className={cx("Calendar", {
          [CalendarS.CalendarRange]:
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
    return this.renderCalendar(current);
  }
}

type WeekProps = {
  date: Dayjs;
  month: Dayjs;
  selected?: Dayjs;
  selectedEnd?: Dayjs;
  selectAll?: SelectAll | null;
  isRangePicker?: boolean;
  onClickDay: (date: Dayjs) => void;
  noContext?: boolean;
};

class Week extends Component<WeekProps> {
  render() {
    const days = [];
    let {
      date,
      month,
      selected,
      selectedEnd,
      selectAll,
      isRangePicker,
      noContext,
    } = this.props;

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
      const classes = cx(
        { [CalendarS.CalendarNoContext]: noContext },
        CalendarS.CalendarDay,
        CS.cursorPointer,
        CS.textCentered,
        {
          [CalendarS.CalendarDayThisMonth]: date.month() === month.month(),
          [CalendarS.CalendarDaySelected]: isSelectedStart,
          [CalendarS.CalendarDaySelectedEnd]: isSelectedEnd,
          [CalendarS.CalendarDayInRange]:
            (selectAll && isInRange) ||
            (!(
              date.isSame(selected, "day") || date.isSame(selectedEnd, "day")
            ) &&
              (date.isSame(selected, "day") ||
                date.isSame(selectedEnd, "day") ||
                (selectedEnd &&
                  selectedEnd.isAfter(date, "day") &&
                  date.isAfter(selected, "day")))),
        },
      );
      days.push(
        <CalendarDay
          key={date.toString()}
          className={classes}
          onClick={this.props.onClickDay.bind(null, date)}
          isInRange={isInRange}
          isSelected={isSelected}
          isSelectedStart={isSelectedStart}
          isSelectedEnd={isSelectedEnd}
        >
          {date.date()}
        </CalendarDay>,
      );
      date = dayjs(date).add(1, "day");
    }

    return (
      <div className={CalendarS.CalendarWeek} key={days[0].toString()}>
        {days}
      </div>
    );
  }
}
