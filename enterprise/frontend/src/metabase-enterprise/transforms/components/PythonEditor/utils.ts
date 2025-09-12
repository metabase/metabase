import {
  type Completion,
  type CompletionContext,
  autocompletion,
} from "@codemirror/autocomplete";
import { pythonLanguage } from "@codemirror/lang-python";

// This is the closest you can get to "loading pandas definitions"

const pandasDefinitions: Record<string, Completion[]> = {
  pd: [
    {
      label: "DataFrame",
      type: "class",
      info: "Two-dimensional, size-mutable, potentially heterogeneous tabular data",
    },
    {
      label: "Series",
      type: "class",
      info: "One-dimensional ndarray with axis labels",
    },
    {
      label: "read_csv",
      type: "function",
      info: "Read a comma-separated values (csv) file into DataFrame",
    },
    {
      label: "read_excel",
      type: "function",
      info: "Read an Excel file into a pandas DataFrame",
    },
    {
      label: "read_json",
      type: "function",
      info: "Convert a JSON string to pandas object",
    },
    {
      label: "read_sql",
      type: "function",
      info: "Read SQL query or database table into a DataFrame",
    },
    {
      label: "read_parquet",
      type: "function",
      info: "Load a parquet object from file path",
    },
    {
      label: "concat",
      type: "function",
      info: "Concatenate pandas objects along a particular axis",
    },
    {
      label: "merge",
      type: "function",
      info: "Merge DataFrame or named Series objects with a database-style join",
    },
    {
      label: "pivot_table",
      type: "function",
      info: "Create a spreadsheet-style pivot table as a DataFrame",
    },
    {
      label: "crosstab",
      type: "function",
      info: "Compute a simple cross tabulation of two (or more) factors",
    },
    {
      label: "get_dummies",
      type: "function",
      info: "Convert categorical variable(s) into dummy/indicator variables",
    },
    {
      label: "date_range",
      type: "function",
      info: "Return a fixed frequency DatetimeIndex",
    },
    {
      label: "to_datetime",
      type: "function",
      info: "Convert argument to datetime",
    },
    {
      label: "to_numeric",
      type: "function",
      info: "Convert argument to a numeric type",
    },
    {
      label: "cut",
      type: "function",
      info: "Bin values into discrete intervals",
    },
    {
      label: "qcut",
      type: "function",
      info: "Quantile-based discretization function",
    },
    {
      label: "isna",
      type: "function",
      info: "Detect missing values for an array-like object",
    },
    {
      label: "isnull",
      type: "function",
      info: "Detect missing values for an array-like object",
    },
    {
      label: "notna",
      type: "function",
      info: "Detect non-missing values for an array-like object",
    },
    {
      label: "notnull",
      type: "function",
      info: "Detect non-missing values for an array-like object",
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
      info: "Print a concise summary of a DataFrame",
    },
    {
      label: "describe",
      type: "method",
      info: "Generate descriptive statistics",
    },
    {
      label: "shape",
      type: "property",
      info: "Return a tuple representing the dimensionality",
    },
    {
      label: "size",
      type: "property",
      info: "Return an int representing the number of elements",
    },
    {
      label: "columns",
      type: "property",
      info: "The column labels of the DataFrame",
    },
    {
      label: "index",
      type: "property",
      info: "The index (row labels) of the DataFrame",
    },
    {
      label: "dtypes",
      type: "property",
      info: "Return the dtypes in the DataFrame",
    },
    {
      label: "values",
      type: "property",
      info: "Return a Numpy representation of the DataFrame",
    },

    // Selection/Indexing
    {
      label: "loc",
      type: "property",
      info: "Access a group of rows and columns by label(s)",
    },
    {
      label: "iloc",
      type: "property",
      info: "Purely integer-location based indexing",
    },
    {
      label: "at",
      type: "property",
      info: "Access a single value for a row/column label pair",
    },
    {
      label: "iat",
      type: "property",
      info: "Access a single value for a row/column pair by integer position",
    },
    {
      label: "query",
      type: "method",
      info: "Query the columns of a DataFrame with a boolean expression",
    },
    {
      label: "filter",
      type: "method",
      info: "Subset the dataframe rows or columns according to labels",
    },
    {
      label: "where",
      type: "method",
      info: "Replace values where the condition is False",
    },
    {
      label: "mask",
      type: "method",
      info: "Replace values where the condition is True",
    },

    // Data Cleaning
    {
      label: "drop",
      type: "method",
      info: "Drop specified labels from rows or columns",
    },
    {
      label: "drop_duplicates",
      type: "method",
      info: "Return DataFrame with duplicate rows removed",
    },
    { label: "dropna", type: "method", info: "Remove missing values" },
    {
      label: "fillna",
      type: "method",
      info: "Fill NA/NaN values using the specified method",
    },
    {
      label: "replace",
      type: "method",
      info: "Replace values given in to_replace with value",
    },
    {
      label: "interpolate",
      type: "method",
      info: "Fill NaN values using an interpolation method",
    },
    {
      label: "duplicated",
      type: "method",
      info: "Return boolean Series denoting duplicate rows",
    },
    { label: "isnull", type: "method", info: "Detect missing values" },
    { label: "isna", type: "method", info: "Detect missing values" },
    {
      label: "notnull",
      type: "method",
      info: "Detect existing (non-missing) values",
    },
    {
      label: "notna",
      type: "method",
      info: "Detect existing (non-missing) values",
    },

    // Transformations
    {
      label: "sort_values",
      type: "method",
      info: "Sort by the values along either axis",
    },
    {
      label: "sort_index",
      type: "method",
      info: "Sort object by labels (along an axis)",
    },
    {
      label: "reset_index",
      type: "method",
      info: "Reset the index, or a level of it",
    },
    {
      label: "set_index",
      type: "method",
      info: "Set the DataFrame index using existing columns",
    },
    {
      label: "reindex",
      type: "method",
      info: "Conform Series/DataFrame to new index",
    },
    { label: "rename", type: "method", info: "Alter axes labels" },
    {
      label: "assign",
      type: "method",
      info: "Assign new columns to a DataFrame",
    },
    {
      label: "pipe",
      type: "method",
      info: "Apply chainable functions that expect Series or DataFrames",
    },

    // Aggregation/GroupBy
    {
      label: "groupby",
      type: "method",
      info: "Group DataFrame using a mapper or by a Series of columns",
    },
    {
      label: "agg",
      type: "method",
      info: "Aggregate using one or more operations",
    },
    {
      label: "aggregate",
      type: "method",
      info: "Aggregate using one or more operations",
    },
    {
      label: "apply",
      type: "method",
      info: "Apply a function along an axis of the DataFrame",
    },
    {
      label: "applymap",
      type: "method",
      info: "Apply a function to a Dataframe elementwise",
    },
    {
      label: "transform",
      type: "method",
      info: "Call func on self producing a DataFrame with transformed values",
    },
    {
      label: "rolling",
      type: "method",
      info: "Provide rolling window calculations",
    },
    {
      label: "expanding",
      type: "method",
      info: "Provide expanding transformations",
    },
    { label: "resample", type: "method", info: "Resample time-series data" },

    // Statistical Methods
    {
      label: "sum",
      type: "method",
      info: "Return the sum of the values for the requested axis",
    },
    {
      label: "mean",
      type: "method",
      info: "Return the mean of the values for the requested axis",
    },
    {
      label: "median",
      type: "method",
      info: "Return the median of the values for the requested axis",
    },
    {
      label: "mode",
      type: "method",
      info: "Get the mode(s) of each element along the selected axis",
    },
    {
      label: "std",
      type: "method",
      info: "Return sample standard deviation over requested axis",
    },
    {
      label: "var",
      type: "method",
      info: "Return unbiased variance over requested axis",
    },
    {
      label: "min",
      type: "method",
      info: "Return the minimum of the values for the requested axis",
    },
    {
      label: "max",
      type: "method",
      info: "Return the maximum of the values for the requested axis",
    },
    {
      label: "count",
      type: "method",
      info: "Count non-NA cells for each column or row",
    },
    {
      label: "nunique",
      type: "method",
      info: "Count number of distinct elements in specified axis",
    },
    {
      label: "value_counts",
      type: "method",
      info: "Return a Series containing counts of unique values",
    },
    {
      label: "corr",
      type: "method",
      info: "Compute pairwise correlation of columns",
    },
    {
      label: "cov",
      type: "method",
      info: "Compute pairwise covariance of columns",
    },
    {
      label: "rank",
      type: "method",
      info: "Compute numerical data ranks (1 through n) along axis",
    },
    {
      label: "quantile",
      type: "method",
      info: "Return values at the given quantile over requested axis",
    },
    {
      label: "clip",
      type: "method",
      info: "Trim values at input threshold(s)",
    },

    // Merging/Joining
    {
      label: "merge",
      type: "method",
      info: "Merge DataFrame or named Series objects",
    },
    {
      label: "join",
      type: "method",
      info: "Join columns of another DataFrame",
    },
    {
      label: "concat",
      type: "method",
      info: "Concatenate pandas objects along a particular axis",
    },
    {
      label: "append",
      type: "method",
      info: "Append rows of other to the end of caller",
    },
    {
      label: "update",
      type: "method",
      info: "Modify in place using non-NA values from another DataFrame",
    },

    // Reshaping
    {
      label: "pivot",
      type: "method",
      info: "Return reshaped DataFrame organized by given index / column values",
    },
    {
      label: "pivot_table",
      type: "method",
      info: "Create a spreadsheet-style pivot table",
    },
    {
      label: "melt",
      type: "method",
      info: "Unpivot a DataFrame from wide to long format",
    },
    {
      label: "stack",
      type: "method",
      info: "Stack the prescribed level(s) from columns to index",
    },
    {
      label: "unstack",
      type: "method",
      info: "Pivot a level of the (necessarily hierarchical) index labels",
    },
    { label: "transpose", type: "method", info: "Transpose index and columns" },
    { label: "T", type: "property", info: "Transpose index and columns" },

    // I/O
    {
      label: "to_csv",
      type: "method",
      info: "Write object to a comma-separated values (csv) file",
    },
    {
      label: "to_excel",
      type: "method",
      info: "Write object to an Excel sheet",
    },
    {
      label: "to_json",
      type: "method",
      info: "Convert the object to a JSON string",
    },
    {
      label: "to_sql",
      type: "method",
      info: "Write records stored in a DataFrame to a SQL database",
    },
    {
      label: "to_parquet",
      type: "method",
      info: "Write a DataFrame to the binary parquet format",
    },
    {
      label: "to_dict",
      type: "method",
      info: "Convert the DataFrame to a dictionary",
    },
    {
      label: "to_html",
      type: "method",
      info: "Render a DataFrame as an HTML table",
    },
    {
      label: "to_string",
      type: "method",
      info: "Render a DataFrame to a console-friendly tabular output",
    },
    {
      label: "to_numpy",
      type: "method",
      info: "Convert the DataFrame to a NumPy array",
    },

    // Time Series
    {
      label: "shift",
      type: "method",
      info: "Shift index by desired number of periods",
    },
    { label: "tshift", type: "method", info: "Shift the time index" },
    {
      label: "diff",
      type: "method",
      info: "First discrete difference of element",
    },
    {
      label: "pct_change",
      type: "method",
      info: "Percentage change between the current and a prior element",
    },

    // Plotting (if matplotlib available)
    {
      label: "plot",
      type: "method",
      info: "Make plots of Series or DataFrame",
    },
    {
      label: "hist",
      type: "method",
      info: "Make a histogram of the DataFrame's columns",
    },
    {
      label: "boxplot",
      type: "method",
      info: "Make a box plot of the DataFrame columns",
    },
  ],

  // Series methods (subset of DataFrame methods that make sense for Series)
  Series: [
    { label: "head", type: "method", info: "Return the first n values" },
    { label: "tail", type: "method", info: "Return the last n values" },
    {
      label: "describe",
      type: "method",
      info: "Generate descriptive statistics",
    },
    {
      label: "value_counts",
      type: "method",
      info: "Return a Series containing counts of unique values",
    },
    {
      label: "unique",
      type: "method",
      info: "Return unique values of Series object",
    },
    {
      label: "nunique",
      type: "method",
      info: "Return number of unique elements in the object",
    },
    { label: "sort_values", type: "method", info: "Sort by the values" },
    {
      label: "sort_index",
      type: "method",
      info: "Sort Series by index labels",
    },
    {
      label: "reset_index",
      type: "method",
      info: "Generate a new DataFrame or Series with the index reset",
    },
    {
      label: "dropna",
      type: "method",
      info: "Return a new Series with missing values removed",
    },
    {
      label: "fillna",
      type: "method",
      info: "Fill NA/NaN values using the specified method",
    },
    {
      label: "apply",
      type: "method",
      info: "Invoke function on values of Series",
    },
    {
      label: "map",
      type: "method",
      info: "Map values of Series according to input correspondence",
    },
    {
      label: "replace",
      type: "method",
      info: "Replace values given in to_replace with value",
    },
    {
      label: "str",
      type: "property",
      info: "Vectorized string functions for Series and Index",
    },
    {
      label: "dt",
      type: "property",
      info: "Accessor object for datetimelike properties",
    },
    {
      label: "cat",
      type: "property",
      info: "Accessor object for categorical properties",
    },
  ],
};

function genericPandasCompletions(context: CompletionContext) {
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

    if (!obj || !pandasDefinitions[obj]) {
      return null;
    }

    const options = pandasDefinitions[obj]
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
      filter: false,
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
