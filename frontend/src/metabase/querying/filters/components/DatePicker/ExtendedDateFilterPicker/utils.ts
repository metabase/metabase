import type { QuarterOnlyOption, QuarterOption, YearOption } from "./types";

export function getQuarterOptions(
  year: number = new Date().getFullYear(),
): QuarterOption[] {
  const quarters: QuarterOption[] = [];

  // Generate quarters for current year and next year
  for (let y = year - 1; y <= year + 1; y++) {
    quarters.push(
      {
        label: `Q1 ${y}`,
        value: `${y}-Q1`,
        startDate: new Date(y, 0, 1), // January 1st
        endDate: new Date(y, 2, 31), // March 31st
        months: [
          new Date(y, 0, 1), // January
          new Date(y, 1, 1), // February
          new Date(y, 2, 1), // March
        ],
      },
      {
        label: `Q2 ${y}`,
        value: `${y}-Q2`,
        startDate: new Date(y, 3, 1), // April 1st
        endDate: new Date(y, 5, 30), // June 30th
        months: [
          new Date(y, 3, 1), // April
          new Date(y, 4, 1), // May
          new Date(y, 5, 1), // June
        ],
      },
      {
        label: `Q3 ${y}`,
        value: `${y}-Q3`,
        startDate: new Date(y, 6, 1), // July 1st
        endDate: new Date(y, 8, 30), // September 30th
        months: [
          new Date(y, 6, 1), // July
          new Date(y, 7, 1), // August
          new Date(y, 8, 1), // September
        ],
      },
      {
        label: `Q4 ${y}`,
        value: `${y}-Q4`,
        startDate: new Date(y, 9, 1), // October 1st
        endDate: new Date(y, 11, 31), // December 31st
        months: [
          new Date(y, 9, 1), // October
          new Date(y, 10, 1), // November
          new Date(y, 11, 1), // December
        ],
      },
    );
  }

  return quarters;
}

export function getCurrentQuarter(): QuarterOption {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const quarters = getQuarterOptions(year);

  // Determine current quarter based on month
  if (month <= 2) {
    return quarters.find((q) => q.value === `${year}-Q1`)!;
  }
  if (month <= 5) {
    return quarters.find((q) => q.value === `${year}-Q2`)!;
  }
  if (month <= 8) {
    return quarters.find((q) => q.value === `${year}-Q3`)!;
  }
  return quarters.find((q) => q.value === `${year}-Q4`)!;
}

export function getYearOptions(): YearOption[] {
  const currentYear = new Date().getFullYear();
  const years: YearOption[] = [];

  // Generate years from 3 years ago to 2 years in the future
  for (let year = currentYear - 3; year <= currentYear + 2; year++) {
    years.push({
      label: year.toString(),
      value: year,
    });
  }

  return years;
}

export function getQuarterOnlyOptions(): QuarterOnlyOption[] {
  return [
    { label: "Q1", value: 1 },
    { label: "Q2", value: 2 },
    { label: "Q3", value: 3 },
    { label: "Q4", value: 4 },
  ];
}

export function buildQuarterOption(
  year: number,
  quarter: number,
): QuarterOption {
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;

  return {
    label: `Q${quarter} ${year}`,
    value: `${year}-Q${quarter}`,
    startDate: new Date(year, startMonth, 1),
    endDate: new Date(year, endMonth + 1, 0), // Last day of end month
    months: [
      new Date(year, startMonth, 1),
      new Date(year, startMonth + 1, 1),
      new Date(year, startMonth + 2, 1),
    ],
  };
}

export function getCurrentYearAndQuarter(): { year: number; quarter: number } {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Determine current quarter based on month (0-indexed)
  const quarter = Math.floor(month / 3) + 1;

  return { year, quarter };
}

export function formatDateRange(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: start.getFullYear() !== end.getFullYear() ? "numeric" : undefined,
  };

  const startStr = start.toLocaleDateString("en-US", options);
  const endStr = end.toLocaleDateString("en-US", options);

  return `${startStr} - ${endStr}`;
}

export function getPeriodOptions() {
  return [
    { label: "Today", value: "today" },
    { label: "Yesterday", value: "yesterday" },
    { label: "WTD", value: "wtd" },
    { label: "PTD", value: "ptd" },
    { label: "QTD", value: "qtd" },
    { label: "YTD", value: "ytd" },
  ];
}

export function getPeriodDateRange(
  period: string,
  quarter: QuarterOption,
): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today": {
      return { start: today, end: today };
    }

    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: yesterday };
    }

    case "wtd": {
      // Week to Date
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return { start: weekStart, end: today };
    }

    case "ptd": {
      // Period to Date (current month)
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: monthStart, end: today };
    }

    case "qtd": {
      // Quarter to Date
      return { start: quarter.startDate, end: today };
    }

    case "ytd": {
      // Year to Date
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return { start: yearStart, end: today };
    }

    default: {
      return { start: today, end: today };
    }
  }
}
