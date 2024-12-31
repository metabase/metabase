import type { FilterMBQL } from "metabase-lib/v1/queries/structured/Filter";
import {
  getRelativeDatetimeInterval,
  isRelativeDatetime,
} from "metabase-lib/v1/queries/utils/query-time";

export function isPreviousDateFilter(filter: FilterMBQL) {
  const [op, _field, left] = filter;
  if (op === "time-interval" && typeof left === "number" && left <= 0) {
    return true;
  }
  const [value] = getRelativeDatetimeInterval(filter);
  return typeof value === "number" && value <= 0;
}

export function isCurrentDateFilter(filter: FilterMBQL) {
  const [op, , value] = filter;
  return op === "time-interval" && (value === "current" || value === null);
}

export function isNextDateFilter(filter: FilterMBQL) {
  const [op, _field, left] = filter;
  if (op === "time-interval" && left > 0) {
    return true;
  }
  const [value] = getRelativeDatetimeInterval(filter);
  return typeof value === "number" && value > 0;
}

export function isBetweenFilter(filter: FilterMBQL) {
  const [op, , left, right] = filter;
  return (
    op === "between" && !isRelativeDatetime(left) && !isRelativeDatetime(right)
  );
}

export function isBeforeDateFilter(filter: FilterMBQL) {
  const [op] = filter;
  return op === "<";
}

export function isOnDateFilter(filter: FilterMBQL) {
  const [op] = filter;
  return op === "=";
}

export function isAfterDateFilter(filter: FilterMBQL) {
  const [op] = filter;
  return op === ">";
}

export function isExcludeDateFilter(filter: FilterMBQL) {
  const [op] = filter;
  return ["!=", "is-null", "not-null"].indexOf(op) > -1;
}
