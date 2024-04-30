import type * as Lib from "metabase-lib";

export function getExample(extraction: Lib.ColumnExtraction) {
  // TODO: this should eventually be moved into Lib.displayInfo
  // to avoid the keys going out of sync with the MLv2-defined extractions.
  const tag = extraction.tag as unknown as string;
  switch (tag) {
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
