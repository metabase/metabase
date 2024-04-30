import * as Lib from "metabase-lib";

export function getExample(info: Lib.ColumnExtractionInfo) {
  // @todo this should eventually be moved into Lib.displayInfo
  // to avoid the keys going out of sync with the MLv2-defined extractions.
  switch (info.tag) {
    case "hour-of-day":
      return "0, 1";
    case "day-of-month":
      return "1, 2";
    case "day-of-week":
      return "Monday, Tuesday";
    case "month-of-year":
      return "Jan, Feb";
    case "quarter-of-year":
      return "Q1, Q2";
    case "year":
      return "2023, 2024";
    case "domain":
      return "example.com, online.com";
    case "host":
      return "example, online";
    case "subdomain":
      return "www, maps";
  }

  return undefined;
}

function getNextName(names: string[], name: string, index: number): string {
  const suffixed = index === 0 ? name : `${name} (${index})`;
  if (!names.includes(suffixed)) {
    return suffixed;
  }
  return getNextName(names, name, index + 1);
}

export function getName(
  query: Lib.Query,
  stageIndex: number,
  info: Lib.ColumnExtractionInfo,
) {
  const columnNames = Lib.returnedColumns(query, stageIndex).map(
    column => Lib.displayInfo(query, stageIndex, column).displayName,
  );

  return getNextName(columnNames, info.displayName, 0);
}
