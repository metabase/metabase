import { isDate } from "metabase/lib/schema_metadata";

import { formatValue } from "metabase/lib/formatting";
import { parseTimestamp } from "metabase/lib/time";

function formatValueForLinkTemplate(value, column) {
  if (isDate(column) && column.unit) {
    return formatDateTimeForParameter(value, column.unit);
  }
  return value;
}

export function renderLinkTextForClick(template, data) {
  return renderTemplateForClick(template, data, ({ value, column }) =>
    formatValue(value, { column }),
  );
}

export function renderLinkURLForClick(template, data) {
  return renderTemplateForClick(template, data, ({ value, column }) =>
    encodeURIComponent(formatValueForLinkTemplate(value, column)),
  );
}

function renderTemplateForClick(
  template,
  data,
  formatFunction = ({ value }) => value,
) {
  return template.replace(/{{([^}]+)}}/g, (whole, columnName) => {
    const valueAndColumn = getValueAndColumnForColumnName(data, columnName);
    if (valueAndColumn) {
      return formatFunction(valueAndColumn);
    }
    console.warn("Missing value for " + name);
    return "";
  });
}

function getValueAndColumnForColumnName(
  { column, parameterBySlug, parameterByName, userAttribute },
  columnName,
) {
  const name = columnName.toLowerCase();
  const dataSources = [
    ["column", column],
    ["filter", parameterByName],
    ["filter", parameterBySlug], // doubling up "filter", let's us search params both by name and slug
    ["user", userAttribute],
  ];
  for (const [key, data] of dataSources) {
    const prefix = key + ":";
    if (name.startsWith(prefix)) {
      return data[name.slice(prefix.length)];
    }
  }
  for (const [, data] of dataSources) {
    if (data[name]) {
      return data[name];
    }
  }
  return "";
}

function formatDateTimeForParameter(value, unit) {
  const m = parseTimestamp(value, unit);
  if (!m.isValid()) {
    return String(value);
  }

  if (unit === "month") {
    return m.format("YYYY-MM");
  } else if (unit === "quarter") {
    return m.format("[Q]Q-YYYY");
  } else if (unit === "date") {
    return m.format("YYYY-MM-DD");
  } else if (unit) {
    const start = m.clone().startOf(unit);
    const end = m.clone().endOf(unit);
    if (start.isValid() && end.isValid()) {
      return `${start.format("YYYY-MM-DD")}~${end.format("YYYY-MM-DD")}`;
    }
    return String(value);
  }
}
