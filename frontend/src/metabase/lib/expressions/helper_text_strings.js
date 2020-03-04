import { t } from "ttag";

const functions = [
  {
    name: "average",
    structure: "avg(" + t`column` + ")",
    description: t`Returns the average of the values in the column.`,
    example: "avg( [" + t`Quantity` + "] )",
    arg1: t`column`,
    arg1Desc: t`The column whose values to average.`,
  },
  {
    name: "between",
    structure: "between(" + t`column` + "," + t`start` + "," + t`end` + ")",
    description: t`Checks a date or numeric column's values to see if they're within the specified range.`,
    example: "between( [" + t`Rating` + "], 3.75, 5 )",
    arg1: t`column`,
    arg1Desc: t`The column whose values to average.`,
  },
  {
    name: "case",
    structure:
      "case(" +
      t`condition` +
      ", " +
      t`output` +
      ", " +
      t`condition` +
      ", " +
      t`output` +
      "…)",
    description: t`Tests a list of cases and returns the corresponding value of the first true case, with an optional default value if nothing else is met.`,
    example:
      "case( [" +
      t`Weight` +
      '] > 200, "' +
      t`Large` +
      '", [' +
      t`Weight` +
      '] > 150, "' +
      t`Medium` +
      '", "' +
      t`Small` +
      '" )',
    arg1: t`condition`,
    arg1Desc: t`Something that should evaluate to true or false.`,
    arg2: t`output`,
    arg2Desc: t`The value that will be returned if the preceeding condition is true.`,
  },
  {
    name: "coalesce",
    structure: "coalesce(" + t`value1` + ", " + t`value2` + ", …)",
    description: t`Looks at the values in each argument in order and returns the first non-null value for each row.`,
    example:
      "coalesce( [" +
      t`Comments` +
      "], [" +
      t`Notes` +
      '], "' +
      t`No comments` +
      '" )',
    arg1: t`value1`,
    arg1Desc: t`A column or value.`,
    arg2: t`value2`,
    arg2Desc: t`If value1 is empty, value2 gets returned if it's not empty, and so on.`,
  },
  {
    name: "concat",
    structure: "concat(" + t`value1` + ", " + t`value2` + ", …)",
    description: t`Combines two or more strings of text together.`,
    example: "concat([" + t`Last Name` + '] , ", ", [' + t`First Name` + "])",
    arg1: t`value1`,
    arg1Desc: t`value2 will be added on to the end of this.`,
    arg2: t`value2`,
    arg2Desc: t`This will be added to the end of value1.`,
  },
  {
    name: "contains",
    structure: "contains(" + t`string1` + ", " + t`string2` + ", …)",
    description: t`Checks to see if string1 contains string2 within it.`,
    example: "contains([" + t`Status` + '] , "' + t`Pass` + '")',
    arg1: t`string1`,
    arg1Desc: t`The contents of this string will be checked.`,
    arg2: t`string2`,
    arg2Desc: t`The string of text to look for.`,
  },
  {
    name: "count",
    structure: "count",
    description: t`Returns the count of rows in the source data.`,
    example: "count",
  },
  {
    name: "countif",
    structure: "countif(" + t`condition` + ")",
    description: t`Only counts rows where the condition is true.`,
    example: "countif( [" + t`Subtotal` + "] > 100 )",
    arg1: t`condition`,
    arg1Desc: t`Something that should evaluate to true or false.`,
  },
  {
    name: "CumulativeCount",
    structure: "CumulativeCount",
    description: t`The additive total of rows across a breakout.`,
    example: "CumulativeCount",
  },
  {
    name: "CumulativeSum",
    structure: "CumulativeSum(" + t`column` + ")",
    description: t`The rolling sum of a column across a breakout.`,
    example: "CumulativeSum( [" + t`Subtotal` + "] )",
    arg1: t`column`,
    arg1Desc: t`The column to sum.`,
  },
  {
    name: "distinct",
    structure: "distinct(" + t`column` + ")",
    description: t`The number of distinct values in this column.`,
    example: "distinct( [" + t`Last Name` + "] )",
    arg1: t`column`,
    arg1Desc: t`The column whose distinct values to count.`,
  },
  {
    name: "endsWith",
    structure: "endsWith(" + t`text` + ", " + t`comparison` + ")",
    description: t`Returns true if the end of the text matches the comparison text.`,
    example: "endsWith([" + t`Appetite` + '] , "' + t`hungry` + '" )',
    arg1: t`text`,
    arg1Desc: t`A column or string of text to check.`,
    arg2: t`comparison`,
    arg2Desc: t`The string of text that the original text should end with.`,
  },
  {
    name: "regexextract",
    structure: "regexextract(" + t`text` + ", " + t`regular_expression` + ")",
    description: t`Extracts matching substrings according to a regular expression.`,
    example: "regexextract([" + t`Address` + '] , "[0-9]+")',
    arg1: t`text`,
    arg1Desc: t`The column or string of text to search though.`,
    arg2: t`regular_expression`,
    arg2Desc: t`The regular expression to match.`,
  },
  {
    name: "lower",
    structure: "lower(" + t`text` + ")",
    description: t`Returns the string of text in all lowercase.`,
    example: "lower( [" + t`Status` + "] )",
    arg1: t`text`,
    arg1Desc: t`The column with values to convert to lowercase.`,
  },
  {
    name: "ltrim",
    structure: "ltrim(" + t`text` + ")",
    description: t`Removes leading whitespace from a string of text.`,
    example: "ltrim( [" + t`Comment` + "] )",
    arg1: t`text`,
    arg1Desc: t`The column with values you want to trim.`,
  },
  {
    name: "max",
    structure: "max(" + t`column` + ")",
    description: t`Returns the largest value found in the column.`,
    example: "max( [" + t`Age` + "] )",
    arg1: t`column`,
    arg1Desc: t`The numeric column whose maximum you want to find.`,
  },
  {
    name: "min",
    structure: "min(" + t`column` + ")",
    description: t`Returns the smallest value found in the column.`,
    example: "min( [" + t`Salary` + "] )",
    arg1: t`column`,
    arg1Desc: t`The numeric column whose minimum you want to find.`,
  },
  {
    name: "replace",
    structure:
      "replace(" +
      t`text` +
      ", " +
      t`position` +
      ", " +
      t`length` +
      ", " +
      t`new_text` +
      ")",
    description: t`Replaces a part of the input text with new text.`,
    example:
      "replace([" + t`Order ID` + "] , 8, 3, [" + t`Updated Part of ID` + "] )",
    arg1: t`text`,
    arg1Desc: t`The text that will be modified.`,
    arg2: t`position`,
    arg2Desc: t`The position where the replacing will start.`,
    arg3: t`length`,
    arg3Desc: t`The number of characters to replace.`,
    arg4: t`new_text`,
    arg4Desc: t`The text to use in the replacement.`,
  },
  {
    name: "rtrim",
    structure: "rtrim(" + t`text` + ")",
    description: t`Removes trailing whitespace from a string of text.`,
    example: "rtrim( [" + t`Comment` + "] )",
    arg1: t`text`,
    arg1Desc: t`The column with values you want to trim.`,
  },
  {
    name: "share",
    structure: "share(" + t`condition` + ")",
    description: t`Returns the percent of rows in the data that match the condition, as a decimal.`,
    example: "share( [" + t`Source` + '] = "Google" )',
    arg1: t`condition`,
    arg1Desc: t`Something that should evaluate to true or false.`,
  },
  {
    name: "startsWith",
    structure: "startsWith(" + t`text` + ", " + t`comparison` + ")",
    description: t`Returns true if the beginning of the text matches the comparison text.`,
    example:
      "startsWith([" + t`Course Name` + '] , "' + t`Computer Science` + '" )',
    arg1: t`text`,
    arg1Desc: t`A column or string of text to check.`,
    arg2: t`comparison`,
    arg2Desc: t`The string of text that the original text should start with.`,
  },
  {
    name: "StandardDeviation",
    structure: "StandardDeviation(" + t`column` + ")",
    description: t`Calculates the standard deviation of the column.`,
    example: "StandardDeviation( [" + t`Population` + "] )",
    arg1: t`column`,
    arg1Desc: t`A numeric column.`,
  },
  {
    name: "substring",
    structure:
      "substring(" + t`text` + ", " + t`position` + ", " + t`length` + ")",
    description: t`Returns a portion of the supplied text.`,
    example: "substring([" + t`Title` + "], 0, 10 )",
    arg1: t`text`,
    arg1Desc: t`The text to return a portion of.`,
    arg2: t`position`,
    arg2Desc: t`The position to start copying characters.`,
    arg3: t`length`,
    arg3Desc: t`The number of characters to return.`,
  },
  {
    name: "sum",
    structure: "sum(" + t`column` + ")",
    description: t`Adds up all the values of the column.`,
    example: "sum( [" + t`Subtotal` + "] )",
    arg1: t`column`,
    arg1Desc: t`The numeric column to sum.`,
  },
  {
    name: "sumif",
    structure: "sumif(" + t`column` + ", " + t`condition` + ")",
    description: t`Sums up values in a column where rows match the condition.`,
    example:
      "sumif( [" +
      t`Subtotal` +
      "], [" +
      t`Order Status` +
      '] = "' +
      t`Valid` +
      '" )',
    arg1: t`column`,
    arg1Desc: t`The column to sum.`,
    arg2: t`condition`,
    arg2Desc: t`Something that should evaluate to true or false.`,
  },
  {
    name: "trim",
    structure: "trim(" + t`text` + ")",
    description: t`Removes leading and trailing whitespace from a string of text.`,
    example: "trim( [" + t`Comment` + "] )",
    arg1: t`text`,
    arg1Desc: t`The column with values you want to trim.`,
  },
  {
    name: "upper",
    structure: "upper(" + t`text` + ")",
    description: t`Returns the string of text in all upper case.`,
    example: "upper( [" + t`Status` + "] )",
    arg1: t`text`,
    arg1Desc: t`The column with values to convert to upper case.`,
  },
];

return functions;
