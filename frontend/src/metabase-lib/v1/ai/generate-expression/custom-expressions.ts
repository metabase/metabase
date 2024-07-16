export const CUSTOM_EXPRESSIONS_LIST = [
  {
      "name": "Average",
      "type": "Aggregate",
      "syntax": "Average(column)",
      "example": "Average([Quantity])",
      "description": "Returns the average of the values in the column."
  },
  {
      "name": "Count",
      "type": "Aggregate",
      "syntax": "Count",
      "example": "Count",
      "description": "Returns the count of rows in the selected data. Cannot be used with Arguments. To count values of a column use `Distinct(<column>)`."
  },
  {
      "name": "CountIf",
      "type": "Aggregate",
      "syntax": "CountIf(condition)",
      "example": "CountIf([Subtotal] > 100)",
      "description": "Only counts rows where the condition is true."
  },
  {
      "name": "CumulativeCount",
      "type": "Aggregate",
      "syntax": "CumulativeCount",
      "example": "CumulativeCount",
      "description": "The additive total of rows across a breakout."
  },
  {
      "name": "CumulativeSum",
      "type": "Aggregate",
      "syntax": "CumulativeSum(column)",
      "example": "CumulativeSum([Subtotal])",
      "description": "The rolling sum of a column across a breakout."
  },
  {
      "name": "Distinct",
      "type": "Aggregate",
      "syntax": "Distinct(column)",
      "example": "Distinct([Last Name])",
      "description": "The number of distinct values in this column. Performs a count of unique values."
  },
  {
      "name": "Max",
      "type": "Aggregate",
      "syntax": "Max(column)",
      "example": "Max([Age])",
      "description": "Returns the largest value found in the column."
  },
  {
      "name": "Median",
      "type": "Aggregate",
      "syntax": "Median(column)",
      "example": "Median([Age])",
      "description": "Returns the median value of the specified column."
  },
  {
      "name": "Min",
      "type": "Aggregate",
      "syntax": "Min(column)",
      "example": "Min([Salary])",
      "description": "Returns the smallest value found in the column."
  },
  {
      "name": "Percentile",
      "type": "Aggregate",
      "syntax": "Percentile(column, percentile-value)",
      "example": "Percentile([Score], 0.9)",
      "description": "Returns the value of the column at the percentile value."
  },
  {
      "name": "Share",
      "type": "Aggregate",
      "syntax": "Share(condition)",
      "example": "Share([Color] = \"Blue\")",
      "description": "Returns the percent of rows in the data that match the condition, as a decimal."
  },
  {
      "name": "StandardDeviation",
      "type": "Aggregate",
      "syntax": "StandardDeviation(column)",
      "example": "StandardDeviation([Population])",
      "description": "Calculates the standard deviation of the column, which is a measure of the variation in a set of values."
  },
  {
      "name": "Sum",
      "type": "Aggregate",
      "syntax": "Sum(column)",
      "example": "Sum([Subtotal])",
      "description": "Adds up all the values of the column."
  },
  {
      "name": "SumIf",
      "type": "Aggregate",
      "syntax": "SumIf(column, condition)",
      "example": "SumIf([Subtotal], [Order Status] = \"Valid\")",
      "description": "Sums up the specified column only for rows where the condition is true."
  },
  {
      "name": "Variance",
      "type": "Aggregate",
      "syntax": "Variance(column)",
      "example": "Variance([Temperature])",
      "description": "Returns the numeric variance for a given column."
  },
  {
      "name": "between",
      "type": "Function",
      "syntax": "between(column, start, end)",
      "example": "between([Created At], \"2019-01-01\", \"2020-12-31\")",
      "description": "Checks a date or number column’s values to see if they’re within the specified range."
  },
  {
      "name": "case",
      "type": "Function",
      "syntax": "case(condition, output, …)",
      "example": "case([Weight] > 200, \"Large\", [Weight] > 150, \"Medium\", \"Small\")",
      "description": "Tests an expression against a list of cases and returns the corresponding value of the first matching case, with an optional default value if nothing else is met."
  },
  {
      "name": "coalesce",
      "type": "Function",
      "syntax": "coalesce(value1, value2, …)",
      "example": "coalesce([Comments], [Notes], \"No comments\")",
      "description": "Looks at the values in each argument in order and returns the first non-null value for each row."
  },
  {
      "name": "isnull",
      "type": "Function",
      "syntax": "isnull(column)",
      "example": "isnull([Tax])",
      "description": "Returns true if the column is null."
  },
  {
      "name": "notnull",
      "type": "Function",
      "syntax": "notnull(column)",
      "example": "notnull([Tax])",
      "description": "Returns true if the column contains a value."
  },
  {
      "name": "abs",
      "type": "Function",
      "syntax": "abs(column)",
      "example": "abs([Debt])",
      "description": "Returns the absolute (positive) value of the specified column."
  },
  {
      "name": "ceil",
      "type": "Function",
      "syntax": "ceil(column)",
      "example": "ceil([Price])",
      "description": "Rounds a decimal up (ceil as in ceiling)."
  },
  {
      "name": "exp",
      "type": "Function",
      "syntax": "exp(column)",
      "example": "exp([Interest Months])",
      "description": "Returns Euler’s number, e, raised to the power of the supplied number."
  },
  {
      "name": "floor",
      "type": "Function",
      "syntax": "floor(column)",
      "example": "floor([Price])",
      "description": "Rounds a decimal number down."
  },
  {
      "name": "log",
      "type": "Function",
      "syntax": "log(column)",
      "example": "log([Value])",
      "description": "Returns the base 10 log of the number."
  },
  {
      "name": "power",
      "type": "Function",
      "syntax": "power(column, exponent)",
      "example": "power([Length], 2)",
      "description": "Raises a number to the power of the exponent value."
  },
  {
      "name": "round",
      "type": "Function",
      "syntax": "round(column)",
      "example": "round([Temperature])",
      "description": "Rounds a decimal number either up or down to the nearest integer value."
  },
  {
      "name": "sqrt",
      "type": "Function",
      "syntax": "sqrt(column)",
      "example": "sqrt([Hypotenuse])",
      "description": "Returns the square root of a value."
  },
  {
      "name": "concat",
      "type": "Function",
      "syntax": "concat(value1, value2, …)",
      "example": "concat([Last Name], \", \", [First Name])",
      "description": "Combine two or more strings together."
  },
  {
      "name": "contains",
      "type": "Function",
      "syntax": "contains(string1, string2)",
      "example": "contains([Status], \"Class\")",
      "description": "Checks to see if string1 contains string2 within it."
  },
  {
      "name": "doesNotContain",
      "type": "Function",
      "syntax": "doesNotContain(string1, string2)",
      "example": "doesNotContain([Status], \"Class\")",
      "description": "Checks to see if string1 does not contain string2 within it."
  },
  {
      "name": "endsWith",
      "type": "Function",
      "syntax": "endsWith(text, comparison)",
      "example": "endsWith([Appetite], \"hungry\")",
      "description": "Returns true if the end of the text matches the comparison text."
  },
  {
      "name": "isempty",
      "type": "Function",
      "syntax": "isempty(column)",
      "example": "isempty([Feedback])",
      "description": "Returns true if a string column contains an empty string or is null."
  },
  {
      "name": "ltrim",
      "type": "Function",
      "syntax": "ltrim(text)",
      "example": "ltrim([Comment])",
      "description": "Removes leading whitespace from a string of text."
  },
  {
      "name": "length",
      "type": "Function",
      "syntax": "length(text)",
      "example": "length([Comment])",
      "description": "Returns the number of characters in text."
  },
  {
      "name": "lower",
      "type": "Function",
      "syntax": "lower(text)",
      "example": "lower([Status])",
      "description": "Returns the string of text in all lower case."
  },
  {
      "name": "notempty",
      "type": "Function",
      "syntax": "notempty(column)",
      "example": "notempty([Feedback])",
      "description": "Returns true if a string column contains a value that is not the empty string."
  },
  {
      "name": "regexextract",
      "type": "Function",
      "syntax": "regexextract(text, regular_expression)",
      "example": "regexextract([Address], \"[0-9]+\")",
      "description": "Extracts matching substrings according to a regular expression."
  },
  {
      "name": "replace",
      "type": "Function",
      "syntax": "replace(text, find, replace)",
      "example": "replace([Title], \"Enormous\", \"Gigantic\")",
      "description": "Replaces all occurrences of a search text in the input text with the replacement text."
  },
  {
      "name": "rtrim",
      "type": "Function",
      "syntax": "rtrim(text)",
      "example": "rtrim([Comment])",
      "description": "Removes trailing whitespace from a string of text."
  },
  {
      "name": "startsWith",
      "type": "Function",
      "syntax": "startsWith(text, comparison)",
      "example": "startsWith([Course Name], \"Computer Science\")",
      "description": "Returns true if the beginning of the text matches the comparison text."
  },
  {
      "name": "substring",
      "type": "Function",
      "syntax": "substring(text, position, length)",
      "example": "substring([Title], 1, 10)",
      "description": "Returns a portion of the supplied text, specified by a starting position and a length."
  },
  {
      "name": "trim",
      "type": "Function",
      "syntax": "trim(text)",
      "example": "trim([Comment])",
      "description": "Removes leading and trailing whitespace from a string of text."
  },
  {
      "name": "upper",
      "type": "Function",
      "syntax": "upper(text)",
      "example": "upper([Status])",
      "description": "Returns the text in all upper case."
  },
  {
      "name": "convertTimezone",
      "type": "Function",
      "syntax": "convertTimezone(column, target, source)",
      "example": "convertTimezone(\"2022-12-28T12:00:00\", \"Canada/Pacific\", \"Canada/Eastern\")",
      "description": "Shifts a date or timestamp value into a specified time zone."
  },
  {
      "name": "datetimeAdd",
      "type": "Function",
      "syntax": "datetimeAdd(column, amount, unit)",
      "example": "datetimeAdd(\"2021-03-25\", 1, \"month\")",
      "description": "Adds some unit of time to a date or timestamp value."
  },
  {
      "name": "datetimeDiff",
      "type": "Function",
      "syntax": "datetimeDiff(datetime1, datetime2, unit)",
      "example": "datetimeDiff(\"2022-02-01\", \"2022-03-01\", \"month\")",
      "description": "Returns the difference between two datetimes in some unit of time."
  },
  {
      "name": "datetimeSubtract",
      "type": "Function",
      "syntax": "datetimeSubtract(column, amount, unit)",
      "example": "datetimeSubtract(\"2021-03-25\", 1, \"month\")",
      "description": "Subtracts some unit of time from a date or timestamp value."
  },
  {
      "name": "day",
      "type": "Function",
      "syntax": "day([datetime column])",
      "example": "day(\"2021-03-25T12:52:37\")",
      "description": "Takes a datetime and returns the day of the month as an integer."
  },
  {
      "name": "hour",
      "type": "Function",
      "syntax": "hour([datetime column])",
      "example": "hour(\"2021-03-25T12:52:37\")",
      "description": "Takes a datetime and returns the hour as an integer (0-23)."
  },
  {
      "name": "interval",
      "type": "Function",
      "syntax": "interval(column, number, text)",
      "example": "interval([Created At], -1, \"month\")",
      "description": "Checks a date column’s values to see if they’re within the relative range."
  },
  {
      "name": "minute",
      "type": "Function",
      "syntax": "minute([datetime column])",
      "example": "minute(\"2021-03-25T12:52:37\")",
      "description": "Takes a datetime and returns the minute as an integer (0-59)."
  },
  {
      "name": "month",
      "type": "Function",
      "syntax": "month([datetime column])",
      "example": "month(\"2021-03-25T12:52:37\")",
      "description": "Takes a datetime and returns the month number (1-12) as an integer."
  },
  {
      "name": "now",
      "type": "Function",
      "syntax": "now",
      "example": "now",
      "description": "Returns the current date and time using your Metabase report timezone."
  },
  {
      "name": "quarter",
      "type": "Function",
      "syntax": "quarter([datetime column])",
      "example": "quarter(\"2021-03-25T12:52:37\")",
      "description": "Takes a datetime and returns the number of the quarter in a year (1-4) as an integer."
  },
  {
      "name": "relativeDateTime",
      "type": "Function",
      "syntax": "relativeDateTime(number, text)",
      "example": "[Orders → Created At] < relativeDateTime(-30, \"day\")",
      "description": "Gets a timestamp relative to the current time."
  },
  {
      "name": "second",
      "type": "Function",
      "syntax": "second([datetime column])",
      "example": "second(\"2021-03-25T12:52:37\")",
      "description": "Takes a datetime and returns the number of seconds in the minute (0-59) as an integer."
  },
  {
      "name": "week",
      "type": "Function",
      "syntax": "week(column, mode)",
      "example": "week(\"2021-03-25T12:52:37\")",
      "description": "Takes a datetime and returns the week as an integer."
  },
  {
      "name": "weekday",
      "type": "Function",
      "syntax": "weekday(column)",
      "example": "weekday([Created At])",
      "description": "Takes a datetime and returns an integer (1-7) with the number of the day of the week."
  },
  {
      "name": "offset",
      "type": "Aggregate",
      "syntax": "Offset(expression, rowOffset)",
      "example": "Offset(Sum([Total]), -1)",
      "description": "Returns the value of an expression in a different row. The rowOffset is the number relative to the current row. For example, -1 for the previous row, or 1 for the next row."
  }
]


export function searchCustomExpressions(userDescription: string) {
  // TODO: Implement to get the most relevant expressions. For now we just return the whole list.

  return CUSTOM_EXPRESSIONS_LIST;
}
