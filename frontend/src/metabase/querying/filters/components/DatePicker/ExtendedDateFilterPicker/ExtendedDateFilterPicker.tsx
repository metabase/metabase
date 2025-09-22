import { useMemo, useState } from "react";
import { t } from "ttag";

import type { SpecificDatePickerValue } from "metabase/querying/filters/types";
import { Button, Divider, Group, Select, Switch, Text } from "metabase/ui";

import { DateRangePicker } from "../SpecificDatePicker/DateRangePicker/DateRangePicker";
import type { DateRangePickerValue } from "../SpecificDatePicker/DateRangePicker/types";

import Styles from "./ExtendedDateFilterPicker.module.css";
import type { ExtendedDateFilterPickerProps } from "./types";
import {
  buildQuarterOption,
  formatDateRange,
  getCurrentYearAndQuarter,
  getPeriodDateRange,
  getPeriodOptions,
  getQuarterOnlyOptions,
  getYearOptions,
} from "./utils";

export function ExtendedDateFilterPicker({
  value,
  onChange,
  onApply,
  onBack,
  readOnly = false,
}: ExtendedDateFilterPickerProps) {
  // Persist extended mode state in localStorage
  const [isExtendedMode, setIsExtendedMode] = useState(() => {
    try {
      return (
        localStorage.getItem("metabase-extended-date-filter-mode") === "true"
      );
    } catch {
      return false;
    }
  });

  // Initialize from existing value if available
  const initialRange =
    value?.values.length === 2
      ? ([value.values[0], value.values[1]] as [Date, Date])
      : [new Date(), new Date()];

  // Extended mode state (only used when isExtendedMode is true)
  const yearOptions = useMemo(() => getYearOptions(), []);
  const quarterOnlyOptions = useMemo(() => getQuarterOnlyOptions(), []);

  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (value?.values.length === 2) {
      return value.values[0].getFullYear();
    }
    return getCurrentYearAndQuarter().year;
  });

  const [selectedQuarterNum, setSelectedQuarterNum] = useState<number>(() => {
    if (value?.values.length === 2) {
      const month = value.values[0].getMonth();
      return Math.floor(month / 3) + 1;
    }
    return getCurrentYearAndQuarter().quarter;
  });

  // Build current quarter option from year and quarter
  const selectedQuarter = useMemo(
    () => buildQuarterOption(selectedYear, selectedQuarterNum),
    [selectedYear, selectedQuarterNum],
  );

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState<[Date, Date]>(initialRange);

  const periodOptions = getPeriodOptions();

  // Handle toggle change and persist state
  const handleToggleChange = (checked: boolean) => {
    setIsExtendedMode(checked);
    try {
      localStorage.setItem(
        "metabase-extended-date-filter-mode",
        checked.toString(),
      );
    } catch {
      // Ignore localStorage errors
    }
  };

  // Conversion utilities
  const toDateRangePickerValue = (
    specificValue: SpecificDatePickerValue | null,
  ): DateRangePickerValue => {
    if (specificValue?.values.length === 2) {
      return {
        dateRange: [specificValue.values[0], specificValue.values[1]],
        hasTime: specificValue.hasTime || false,
      };
    }
    return {
      dateRange: [new Date(), new Date()],
      hasTime: false,
    };
  };

  const fromDateRangePickerValue = (
    rangeValue: DateRangePickerValue,
  ): SpecificDatePickerValue => {
    return {
      type: "specific",
      operator: "between",
      values: rangeValue.dateRange,
      hasTime: rangeValue.hasTime,
    };
  };

  // Standard date range picker handlers
  const handleStandardDateRangeChange = (rangeValue: DateRangePickerValue) => {
    const newValue = fromDateRangePickerValue(rangeValue);
    onChange(newValue);
  };

  const handleStandardSubmit = () => {
    if (onApply && value) {
      onApply(value);
    }
  };

  // Helper to call the appropriate callback for extended mode
  const handleValueChange = (newValue: SpecificDatePickerValue) => {
    // Always update internal state
    onChange(newValue);
    // If onApply is provided (parameter widget context), also call it to apply the filter
    if (onApply) {
      onApply(newValue);
    }
  };

  // Extended mode handlers
  const handleYearChange = (year: string | null) => {
    if (!year) {
      return;
    }

    const yearNum = parseInt(year, 10);
    setSelectedYear(yearNum);
    updateQuarterSelection(yearNum, selectedQuarterNum);
  };

  const handleQuarterChange = (quarter: string | null) => {
    if (!quarter) {
      return;
    }

    const quarterNum = parseInt(quarter, 10);
    setSelectedQuarterNum(quarterNum);
    updateQuarterSelection(selectedYear, quarterNum);
  };

  const updateQuarterSelection = (year: number, quarterNum: number) => {
    // Reset other selections when quarter/year changes
    setSelectedPeriod(null);
    setRangeStart(null);

    const quarter = buildQuarterOption(year, quarterNum);

    // Set default range to the full quarter for visual feedback
    const newRange: [Date, Date] = [quarter.startDate, quarter.endDate];
    setDateRange(newRange);

    // Only update internal state - don't apply filter yet
    // User can explore quarters without closing popup
    const newValue: SpecificDatePickerValue = {
      type: "specific",
      operator: "between",
      values: newRange,
      hasTime: false,
    };
    onChange(newValue);
  };

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    const range = getPeriodDateRange(period, selectedQuarter);
    const newRange: [Date, Date] = [range.start, range.end];
    setDateRange(newRange);
    setRangeStart(null);

    // Immediately apply the period selection
    const newValue: SpecificDatePickerValue = {
      type: "specific",
      operator: "between",
      values: newRange,
      hasTime: false,
    };
    handleValueChange(newValue);
  };

  const handleExtendedDateClick = (date: Date) => {
    if (readOnly) {
      return;
    }

    if (!rangeStart) {
      // First click - start range
      setRangeStart(date);
      const newRange: [Date, Date] = [date, date];
      setDateRange(newRange);
      setSelectedPeriod(null);
    } else {
      // Second click - end range
      const start = rangeStart < date ? rangeStart : date;
      const end = rangeStart < date ? date : rangeStart;
      const newRange: [Date, Date] = [start, end];
      setDateRange(newRange);
      setRangeStart(null);

      // Apply the custom range selection
      const newValue: SpecificDatePickerValue = {
        type: "specific",
        operator: "between",
        values: newRange,
        hasTime: false,
      };
      handleValueChange(newValue);
    }
  };

  const renderCalendar = (month: Date, monthIndex: number) => {
    const year = month.getFullYear();
    const monthNum = month.getMonth();
    const firstDay = new Date(year, monthNum, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    const current = new Date(startDate);

    // Generate 6 weeks of days
    for (let week = 0; week < 6; week++) {
      for (let day = 0; day < 7; day++) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
    }

    const today = new Date();
    const todayStr = today.toDateString();

    return (
      <div key={monthIndex} className={Styles.monthCalendar}>
        <div className={Styles.monthHeader}>
          {month.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </div>

        <div className={Styles.weekdayHeader}>
          {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
            <div key={i} className={Styles.weekday}>
              {day}
            </div>
          ))}
        </div>

        <div className={Styles.calendarDays}>
          {days.map((day, i) => {
            const isCurrentMonth = day.getMonth() === monthNum;
            const isToday = day.toDateString() === todayStr;
            const isSelected =
              dateRange &&
              (day.toDateString() === dateRange[0].toDateString() ||
                day.toDateString() === dateRange[1].toDateString());
            const isInRange =
              dateRange &&
              day >= dateRange[0] &&
              day <= dateRange[1] &&
              isCurrentMonth;
            const isRangeStart =
              dateRange && day.toDateString() === dateRange[0].toDateString();
            const isRangeEnd =
              dateRange && day.toDateString() === dateRange[1].toDateString();

            let className = Styles.day;
            if (!isCurrentMonth) {
              className += ` ${Styles.otherMonth}`;
            }
            if (isToday) {
              className += ` ${Styles.today}`;
            }
            if (isSelected) {
              className += ` ${Styles.selected}`;
            }
            if (isInRange && !isSelected) {
              className += ` ${Styles.inRange}`;
            }
            if (isRangeStart) {
              className += ` ${Styles.rangeStart}`;
            }
            if (isRangeEnd) {
              className += ` ${Styles.rangeEnd}`;
            }

            return (
              <button
                key={i}
                className={className}
                onClick={() => handleExtendedDateClick(day)}
                disabled={readOnly || !isCurrentMonth}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Render standard DateRangePicker when toggle is off
  if (!isExtendedMode) {
    return (
      <div className={Styles.container}>
        {/* Mode Toggle */}
        <Group justify="space-between" p="sm">
          <Text fw={500}>{t`Date Range Selection`}</Text>
          <Switch
            label={t`Extended View`}
            checked={isExtendedMode}
            onChange={(event) =>
              handleToggleChange(event.currentTarget.checked)
            }
            disabled={readOnly}
          />
        </Group>

        <Divider />

        {/* Use Original DateRangePicker */}
        <DateRangePicker
          value={toDateRangePickerValue(value)}
          hasTimeToggle={false}
          onChange={handleStandardDateRangeChange}
          onSubmit={handleStandardSubmit}
          renderSubmitButton={() =>
            onBack ? (
              <Group>
                <Button variant="subtle" onClick={onBack} disabled={readOnly}>
                  {t`Back`}
                </Button>
                <Button onClick={handleStandardSubmit} disabled={readOnly}>
                  {t`Apply Filter`}
                </Button>
              </Group>
            ) : (
              <Button onClick={handleStandardSubmit} disabled={readOnly}>
                {t`Apply Filter`}
              </Button>
            )
          }
        />
      </div>
    );
  }

  // Extended mode render
  return (
    <div className={Styles.container}>
      {/* Mode Toggle */}
      <Group justify="space-between" p="sm">
        <Text fw={500}>{t`Date Range Selection`}</Text>
        <Switch
          label={t`Extended View`}
          checked={isExtendedMode}
          onChange={(event) => handleToggleChange(event.currentTarget.checked)}
          disabled={readOnly}
        />
      </Group>

      <Divider />

      {/* Year and Quarter Selection */}
      <div className={Styles.quarterSection}>
        <div className={Styles.quarterTitle}>{t`Select Year & Quarter`}</div>
        <div className={Styles.dropdownRow}>
          <div
            className={Styles.yearDropdown}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <Select
              className={Styles.yearSelect}
              value={selectedYear.toString()}
              onChange={handleYearChange}
              data={yearOptions.map((y) => ({
                value: y.value.toString(),
                label: y.label,
              }))}
              disabled={readOnly}
              withinPortal={false}
              placeholder="Year"
            />
          </div>
          <div
            className={Styles.quarterDropdown}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <Select
              className={Styles.quarterSelect}
              value={selectedQuarterNum.toString()}
              onChange={handleQuarterChange}
              data={quarterOnlyOptions.map((q) => ({
                value: q.value.toString(),
                label: q.label,
              }))}
              disabled={readOnly}
              withinPortal={false}
              placeholder="Quarter"
            />
          </div>
        </div>
      </div>

      {/* Period Selection */}
      <div className={Styles.periodSection}>
        <div className={Styles.periodTitle}>{t`Quick Periods`}</div>
        <div className={Styles.periodGrid}>
          {periodOptions.map((period) => (
            <button
              key={period.value}
              className={`${Styles.periodOption} ${
                selectedPeriod === period.value ? Styles.selected : ""
              }`}
              onClick={() => handlePeriodChange(period.value)}
              disabled={readOnly}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3-Month Calendar */}
      <div className={Styles.calendarSection}>
        <div className={Styles.calendarTitle}>
          {t`Select Date Range`}
          <span className={Styles.dateRangeInfo}>
            {formatDateRange(dateRange[0], dateRange[1])}
          </span>
        </div>

        <div className={Styles.calendarGrid}>
          {selectedQuarter.months.map((month, index) =>
            renderCalendar(month, index),
          )}
        </div>
      </div>

      <Divider />

      {/* Actions */}
      <Group justify="space-between" p="sm">
        {onBack && (
          <Button variant="subtle" onClick={onBack} disabled={readOnly}>
            {t`Back`}
          </Button>
        )}

        <Button
          onClick={() => {
            const newValue: SpecificDatePickerValue = {
              type: "specific",
              operator: "between",
              values: dateRange,
              hasTime: false,
            };
            handleValueChange(newValue);
          }}
          disabled={readOnly}
        >
          {t`Apply Filter`}
        </Button>
      </Group>
    </div>
  );
}
