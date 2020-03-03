import { t } from "ttag";

// avg
{
  name: average,
  structure: "avg(" + t`column` + ")",
  description: t`Returns the average of the values in the column.`,
  example: "avg( [" + t`Quantity` + "] )",
  arg1: t`column`,
  arg1Desc: t`The column whose values to average.`,
},
// between
{
  name: between,
  structure: "between(" + t`column` + "," + t`start`+ "," + t`end` + ")",
  description: t`Checks a date or number column's values to see if they're within the specified range.`,
  example: "between( [" + t`Rating` + "], 3.75, 5 )",
  arg1: t`column`,
  arg1Desc: t`The column whose values to average.`,
},
