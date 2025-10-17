import {
  type Completion,
  type CompletionContext,
  autocompletion,
} from "@codemirror/autocomplete";
import { pythonLanguage } from "@codemirror/lang-python";
import { t } from "ttag";

const pandasDefinitions = (): Record<string, Completion[]> => ({
  pd: [
    {
      label: "DataFrame",
      type: "class",
      info: t`Two-dimensional, size-mutable, potentially heterogeneous tabular data`,
    },
    {
      label: "Series",
      type: "class",
      info: t`One-dimensional ndarray with axis labels`,
    },
    {
      label: "read_csv",
      type: "function",
      info: t`Read a comma-separated values (csv) file into DataFrame`,
    },
    {
      label: "read_excel",
      type: "function",
      info: t`Read an Excel file into a pandas DataFrame`,
    },
    {
      label: "read_json",
      type: "function",
      info: t`Convert a JSON string to pandas object`,
    },
    {
      label: "read_sql",
      type: "function",
      info: t`Read SQL query or database table into a DataFrame`,
    },
    {
      label: "read_parquet",
      type: "function",
      info: t`Load a parquet object from file path`,
    },
    {
      label: "concat",
      type: "function",
      info: t`Concatenate pandas objects along a particular axis`,
    },
    {
      label: "merge",
      type: "function",
      info: t`Merge DataFrame or named Series objects with a database-style join`,
    },
    {
      label: "pivot_table",
      type: "function",
      info: t`Create a spreadsheet-style pivot table as a DataFrame`,
    },
    {
      label: "crosstab",
      type: "function",
      info: t`Compute a simple cross tabulation of two (or more) factors`,
    },
    {
      label: "get_dummies",
      type: "function",
      info: t`Convert categorical variable(s) into dummy/indicator variables`,
    },
    {
      label: "date_range",
      type: "function",
      info: t`Return a fixed frequency DatetimeIndex`,
    },
    {
      label: "to_datetime",
      type: "function",
      info: t`Convert argument to datetime`,
    },
    {
      label: "to_numeric",
      type: "function",
      info: t`Convert argument to a numeric type`,
    },
    {
      label: "cut",
      type: "function",
      info: t`Bin values into discrete intervals`,
    },
    {
      label: "qcut",
      type: "function",
      info: t`Quantile-based discretization function`,
    },
    {
      label: "isna",
      type: "function",
      info: t`Detect missing values for an array-like object`,
    },
    {
      label: "isnull",
      type: "function",
      info: t`Detect missing values for an array-like object`,
    },
    {
      label: "notna",
      type: "function",
      info: t`Detect non-missing values for an array-like object`,
    },
    {
      label: "notnull",
      type: "function",
      info: t`Detect non-missing values for an array-like object`,
    },
  ],

  // DataFrame methods and properties
  DataFrame: [
    // Viewing/Inspection
    { label: "head", type: "method", info: "Return the first n rows" },
    { label: "tail", type: "method", info: "Return the last n rows" },
    {
      label: "info",
      type: "method",
      info: t`Print a concise summary of a DataFrame`,
    },
    {
      label: "describe",
      type: "method",
      info: t`Generate descriptive statistics`,
    },
    {
      label: "shape",
      type: "property",
      info: t`Return a tuple representing the dimensionality`,
    },
    {
      label: "size",
      type: "property",
      info: t`Return an int representing the number of elements`,
    },
    {
      label: "columns",
      type: "property",
      info: t`The column labels of the DataFrame`,
    },
    {
      label: "index",
      type: "property",
      info: t`The index (row labels) of the DataFrame`,
    },
    {
      label: "dtypes",
      type: "property",
      info: t`Return the dtypes in the DataFrame`,
    },
    {
      label: "values",
      type: "property",
      info: t`Return a Numpy representation of the DataFrame`,
    },

    // Selection/Indexing
    {
      label: "loc",
      type: "property",
      info: t`Access a group of rows and columns by label(s)`,
    },
    {
      label: "iloc",
      type: "property",
      info: t`Purely integer-location based indexing`,
    },
    {
      label: "at",
      type: "property",
      info: t`Access a single value for a row/column label pair`,
    },
    {
      label: "iat",
      type: "property",
      info: t`Access a single value for a row/column pair by integer position`,
    },
    {
      label: "query",
      type: "method",
      info: t`Query the columns of a DataFrame with a boolean expression`,
    },
    {
      label: "filter",
      type: "method",
      info: t`Subset the dataframe rows or columns according to labels`,
    },
    {
      label: "where",
      type: "method",
      info: t`Replace values where the condition is False`,
    },
    {
      label: "mask",
      type: "method",
      info: t`Replace values where the condition is True`,
    },

    // Data Cleaning
    {
      label: "drop",
      type: "method",
      info: t`Drop specified labels from rows or columns`,
    },
    {
      label: "drop_duplicates",
      type: "method",
      info: t`Return DataFrame with duplicate rows removed`,
    },
    { label: "dropna", type: "method", info: "Remove missing values" },
    {
      label: "fillna",
      type: "method",
      info: t`Fill NA/NaN values using the specified method`,
    },
    {
      label: "replace",
      type: "method",
      info: t`Replace values given in to_replace with value`,
    },
    {
      label: "interpolate",
      type: "method",
      info: t`Fill NaN values using an interpolation method`,
    },
    {
      label: "duplicated",
      type: "method",
      info: t`Return boolean Series denoting duplicate rows`,
    },
    { label: "isnull", type: "method", info: "Detect missing values" },
    { label: "isna", type: "method", info: "Detect missing values" },
    {
      label: "notnull",
      type: "method",
      info: t`Detect existing (non-missing) values`,
    },
    {
      label: "notna",
      type: "method",
      info: t`Detect existing (non-missing) values`,
    },

    // Transformations
    {
      label: "sort_values",
      type: "method",
      info: t`Sort by the values along either axis`,
    },
    {
      label: "sort_index",
      type: "method",
      info: t`Sort object by labels (along an axis)`,
    },
    {
      label: "reset_index",
      type: "method",
      info: t`Reset the index, or a level of it`,
    },
    {
      label: "set_index",
      type: "method",
      info: t`Set the DataFrame index using existing columns`,
    },
    {
      label: "reindex",
      type: "method",
      info: t`Conform Series/DataFrame to new index`,
    },
    { label: "rename", type: "method", info: "Alter axes labels" },
    {
      label: "assign",
      type: "method",
      info: t`Assign new columns to a DataFrame`,
    },
    {
      label: "pipe",
      type: "method",
      info: t`Apply chainable functions that expect Series or DataFrames`,
    },

    // Aggregation/GroupBy
    {
      label: "groupby",
      type: "method",
      info: t`Group DataFrame using a mapper or by a Series of columns`,
    },
    {
      label: "agg",
      type: "method",
      info: t`Aggregate using one or more operations`,
    },
    {
      label: "aggregate",
      type: "method",
      info: t`Aggregate using one or more operations`,
    },
    {
      label: "apply",
      type: "method",
      info: t`Apply a function along an axis of the DataFrame`,
    },
    {
      label: "applymap",
      type: "method",
      info: t`Apply a function to a Dataframe elementwise`,
    },
    {
      label: "transform",
      type: "method",
      info: t`Call func on self producing a DataFrame with transformed values`,
    },
    {
      label: "rolling",
      type: "method",
      info: t`Provide rolling window calculations`,
    },
    {
      label: "expanding",
      type: "method",
      info: t`Provide expanding transformations`,
    },
    { label: "resample", type: "method", info: "Resample time-series data" },

    // Statistical Methods
    {
      label: "sum",
      type: "method",
      info: t`Return the sum of the values for the requested axis`,
    },
    {
      label: "mean",
      type: "method",
      info: t`Return the mean of the values for the requested axis`,
    },
    {
      label: "median",
      type: "method",
      info: t`Return the median of the values for the requested axis`,
    },
    {
      label: "mode",
      type: "method",
      info: t`Get the mode(s) of each element along the selected axis`,
    },
    {
      label: "std",
      type: "method",
      info: t`Return sample standard deviation over requested axis`,
    },
    {
      label: "var",
      type: "method",
      info: t`Return unbiased variance over requested axis`,
    },
    {
      label: "min",
      type: "method",
      info: t`Return the minimum of the values for the requested axis`,
    },
    {
      label: "max",
      type: "method",
      info: t`Return the maximum of the values for the requested axis`,
    },
    {
      label: "count",
      type: "method",
      info: t`Count non-NA cells for each column or row`,
    },
    {
      label: "nunique",
      type: "method",
      info: t`Count number of distinct elements in specified axis`,
    },
    {
      label: "value_counts",
      type: "method",
      info: t`Return a Series containing counts of unique values`,
    },
    {
      label: "corr",
      type: "method",
      info: t`Compute pairwise correlation of columns`,
    },
    {
      label: "cov",
      type: "method",
      info: t`Compute pairwise covariance of columns`,
    },
    {
      label: "rank",
      type: "method",
      info: t`Compute numerical data ranks (1 through n) along axis`,
    },
    {
      label: "quantile",
      type: "method",
      info: t`Return values at the given quantile over requested axis`,
    },
    {
      label: "clip",
      type: "method",
      info: t`Trim values at input threshold(s)`,
    },

    // Merging/Joining
    {
      label: "merge",
      type: "method",
      info: t`Merge DataFrame or named Series objects`,
    },
    {
      label: "join",
      type: "method",
      info: t`Join columns of another DataFrame`,
    },
    {
      label: "concat",
      type: "method",
      info: t`Concatenate pandas objects along a particular axis`,
    },
    {
      label: "append",
      type: "method",
      info: t`Append rows of other to the end of caller`,
    },
    {
      label: "update",
      type: "method",
      info: t`Modify in place using non-NA values from another DataFrame`,
    },

    // Reshaping
    {
      label: "pivot",
      type: "method",
      info: t`Return reshaped DataFrame organized by given index / column values`,
    },
    {
      label: "pivot_table",
      type: "method",
      info: t`Create a spreadsheet-style pivot table`,
    },
    {
      label: "melt",
      type: "method",
      info: t`Unpivot a DataFrame from wide to long format`,
    },
    {
      label: "stack",
      type: "method",
      info: t`Stack the prescribed level(s) from columns to index`,
    },
    {
      label: "unstack",
      type: "method",
      info: t`Pivot a level of the (necessarily hierarchical) index labels`,
    },
    { label: "transpose", type: "method", info: "Transpose index and columns" },
    { label: "T", type: "property", info: "Transpose index and columns" },

    // I/O
    {
      label: "to_csv",
      type: "method",
      info: t`Write object to a comma-separated values (csv) file`,
    },
    {
      label: "to_excel",
      type: "method",
      info: t`Write object to an Excel sheet`,
    },
    {
      label: "to_json",
      type: "method",
      info: t`Convert the object to a JSON string`,
    },
    {
      label: "to_sql",
      type: "method",
      info: t`Write records stored in a DataFrame to a SQL database`,
    },
    {
      label: "to_parquet",
      type: "method",
      info: t`Write a DataFrame to the binary parquet format`,
    },
    {
      label: "to_dict",
      type: "method",
      info: t`Convert the DataFrame to a dictionary`,
    },
    {
      label: "to_html",
      type: "method",
      info: t`Render a DataFrame as an HTML table`,
    },
    {
      label: "to_string",
      type: "method",
      info: t`Render a DataFrame to a console-friendly tabular output`,
    },
    {
      label: "to_numpy",
      type: "method",
      info: t`Convert the DataFrame to a NumPy array`,
    },

    // Time Series
    {
      label: "shift",
      type: "method",
      info: t`Shift index by desired number of periods`,
    },
    { label: "tshift", type: "method", info: "Shift the time index" },
    {
      label: "diff",
      type: "method",
      info: t`First discrete difference of element`,
    },
    {
      label: "pct_change",
      type: "method",
      info: t`Percentage change between the current and a prior element`,
    },

    // Plotting (if matplotlib available)
    {
      label: "plot",
      type: "method",
      info: t`Make plots of Series or DataFrame`,
    },
    {
      label: "hist",
      type: "method",
      info: t`Make a histogram of the DataFrame's columns`,
    },
    {
      label: "boxplot",
      type: "method",
      info: t`Make a box plot of the DataFrame columns`,
    },
  ],

  // Series methods (subset of DataFrame methods that make sense for Series)
  Series: [
    { label: "head", type: "method", info: "Return the first n values" },
    { label: "tail", type: "method", info: "Return the last n values" },
    {
      label: "describe",
      type: "method",
      info: t`Generate descriptive statistics`,
    },
    {
      label: "value_counts",
      type: "method",
      info: t`Return a Series containing counts of unique values`,
    },
    {
      label: "unique",
      type: "method",
      info: t`Return unique values of Series object`,
    },
    {
      label: "nunique",
      type: "method",
      info: t`Return number of unique elements in the object`,
    },
    { label: "sort_values", type: "method", info: "Sort by the values" },
    {
      label: "sort_index",
      type: "method",
      info: t`Sort Series by index labels`,
    },
    {
      label: "reset_index",
      type: "method",
      info: t`Generate a new DataFrame or Series with the index reset`,
    },
    {
      label: "dropna",
      type: "method",
      info: t`Return a new Series with missing values removed`,
    },
    {
      label: "fillna",
      type: "method",
      info: t`Fill NA/NaN values using the specified method`,
    },
    {
      label: "apply",
      type: "method",
      info: t`Invoke function on values of Series`,
    },
    {
      label: "map",
      type: "method",
      info: t`Map values of Series according to input correspondence`,
    },
    {
      label: "replace",
      type: "method",
      info: t`Replace values given in to_replace with value`,
    },
    {
      label: "str",
      type: "property",
      info: t`Vectorized string functions for Series and Index`,
    },
    {
      label: "dt",
      type: "property",
      info: t`Accessor object for datetimelike properties`,
    },
    {
      label: "cat",
      type: "property",
      info: t`Accessor object for categorical properties`,
    },
  ],
});

function genericPandasCompletions(context: CompletionContext) {
  const definitions = pandasDefinitions();

  const word = context.matchBefore(/[\w.]*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }

  const text = word.text;

  // Match patterns like "pd.", "df.", etc.
  if (text.includes(".")) {
    const parts = text.split(".");
    const obj = parts.at(-2);
    const partial = parts.at(-1) ?? "";

    if (!obj || !definitions[obj]) {
      return null;
    }

    const options = definitions[obj]
      .filter(
        (item) =>
          !partial ||
          item.label.toLowerCase().startsWith(partial.toLowerCase()),
      )
      .map((comp) => ({
        ...comp,
        info: undefined,
        boost: comp.type === "method" ? 2 : comp.type === "function" ? 1 : 0,
      }));

    return {
      from: word.from + text.length - partial.length,
      options,
    };
  }
}

export const completion = [
  pythonLanguage.data.of({
    autocomplete: genericPandasCompletions,
  }),
  autocompletion(),
];
