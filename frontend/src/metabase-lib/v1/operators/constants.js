import { t } from "ttag";

import {
  BOOLEAN,
  COORDINATE,
  FOREIGN_KEY,
  LOCATION,
  NUMBER,
  PRIMARY_KEY,
  STRING,
  STRING_LIKE,
  TEMPORAL,
  TYPE,
  UNKNOWN,
} from "metabase-lib/v1/types/constants";
import {
  isBoolean,
  isDate,
  isLongitude,
  isNumeric,
} from "metabase-lib/v1/types/utils/isa";

function freeformArgument(field, table) {
  return {
    type: "text",
  };
}

function numberArgument(field, table) {
  return {
    type: "number",
  };
}

function comparableArgument(field, table) {
  if (isDate(field)) {
    return {
      type: "date",
    };
  }

  if (isNumeric(field)) {
    return {
      type: "number",
    };
  }

  return {
    type: "text",
  };
}

function equivalentArgument(field, table) {
  if (isBoolean(field)) {
    return {
      type: "select",
      values: [
        { key: true, name: t`True` },
        { key: false, name: t`False` },
      ],
      default: true,
    };
  }

  if (isDate(field)) {
    return {
      type: "date",
    };
  }

  if (isNumeric(field)) {
    return {
      type: "number",
    };
  }

  return {
    type: "text",
  };
}

function longitudeFieldSelectArgument(field, table) {
  const values = table.fields
    .filter((field) => isLongitude(field))
    .map((field) => ({
      key: field.id,
      name: field.display_name,
    }));
  if (values.length === 1) {
    return {
      type: "hidden",
      default: values[0].key,
    };
  } else {
    return {
      type: "select",
      values: values,
    };
  }
}

const CASE_SENSITIVE_OPTION = {
  "case-sensitive": {
    defaultValue: true,
  },
};

// each of these has an implicit field argument, followed by 0 or more additional arguments
export const FIELD_FILTER_OPERATORS = {
  "=": {
    validArgumentsFilters: [equivalentArgument],
    multi: true,
  },
  "!=": {
    validArgumentsFilters: [equivalentArgument],
    multi: true,
  },
  "is-empty": {
    validArgumentsFilters: [],
  },
  "not-empty": {
    validArgumentsFilters: [],
  },
  "is-null": {
    validArgumentsFilters: [],
  },
  "not-null": {
    validArgumentsFilters: [],
  },
  "<": {
    validArgumentsFilters: [comparableArgument],
  },
  "<=": {
    validArgumentsFilters: [comparableArgument],
  },
  ">": {
    validArgumentsFilters: [comparableArgument],
  },
  ">=": {
    validArgumentsFilters: [comparableArgument],
  },
  inside: {
    validArgumentsFilters: [
      longitudeFieldSelectArgument,
      numberArgument,
      numberArgument,
      numberArgument,
      numberArgument,
    ],
    placeholders: [
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`Select longitude field`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`Enter upper latitude`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`Enter left longitude`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`Enter lower latitude`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      t`Enter right longitude`,
    ],
    formatOptions: [
      { hide: true },
      { column: { semantic_type: TYPE.Latitude }, compact: true },
      { column: { semantic_type: TYPE.Longitude }, compact: true },
      { column: { semantic_type: TYPE.Latitude }, compact: true },
      { column: { semantic_type: TYPE.Longitude }, compact: true },
    ],
  },
  between: {
    validArgumentsFilters: [comparableArgument, comparableArgument],
  },
  "starts-with": {
    multi: true,
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  "ends-with": {
    multi: true,
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  contains: {
    multi: true,
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
  "does-not-contain": {
    multi: true,
    validArgumentsFilters: [freeformArgument],
    options: CASE_SENSITIVE_OPTION,
    optionsDefaults: { "case-sensitive": false },
  },
};

const DEFAULT_FILTER_OPERATORS = [
  {
    name: "=",
    get verboseName() {
      return t`Is`;
    },
  },
  {
    name: "!=",
    get verboseName() {
      return t`Is not`;
    },
  },
  {
    name: "is-null",
    get verboseName() {
      return t`Is empty`;
    },
  },
  {
    name: "not-null",
    get verboseName() {
      return t`Not empty`;
    },
  },
];

const KEY_FILTER_OPERATORS = [
  {
    name: "=",
    get verboseName() {
      return t`Is`;
    },
  },
  {
    name: "!=",
    get verboseName() {
      return t`Is not`;
    },
  },
  {
    name: ">",
    get verboseName() {
      return t`Greater than`;
    },
  },
  {
    name: "<",
    get verboseName() {
      return t`Less than`;
    },
  },
  {
    name: "between",
    get verboseName() {
      return t`Between`;
    },
  },
  {
    name: ">=",
    get verboseName() {
      return t`Greater than or equal to`;
    },
  },
  {
    name: "<=",
    get verboseName() {
      return t`Less than or equal to`;
    },
  },
  {
    name: "is-null",
    get verboseName() {
      return t`Is empty`;
    },
  },
  {
    name: "not-null",
    get verboseName() {
      return t`Not empty`;
    },
  },
];

// ordered list of operators and metadata per type
export const FILTER_OPERATORS_BY_TYPE_ORDERED = {
  [NUMBER]: [
    {
      name: "=",
      get verboseName() {
        return t`Equal to`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Not equal to`;
      },
    },
    {
      name: ">",
      get verboseName() {
        return t`Greater than`;
      },
    },
    {
      name: "<",
      get verboseName() {
        return t`Less than`;
      },
    },
    {
      name: "between",
      get verboseName() {
        return t`Between`;
      },
    },
    {
      name: ">=",
      get verboseName() {
        return t`Greater than or equal to`;
      },
    },
    {
      name: "<=",
      get verboseName() {
        return t`Less than or equal to`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not empty`;
      },
    },
  ],
  [STRING]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Is not`;
      },
    },
    {
      name: "contains",
      get verboseName() {
        return t`Contains`;
      },
    },
    {
      name: "does-not-contain",
      get verboseName() {
        return t`Does not contain`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is null`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not null`;
      },
    },
    {
      name: "is-empty",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-empty",
      get verboseName() {
        return t`Not empty`;
      },
    },
    {
      name: "starts-with",
      get verboseName() {
        return t`Starts with`;
      },
    },
    {
      name: "ends-with",
      get verboseName() {
        return t`Ends with`;
      },
    },
  ],
  [STRING_LIKE]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Is not`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is null`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not null`;
      },
    },
    {
      name: "is-empty",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-empty",
      get verboseName() {
        return t`Not empty`;
      },
    },
  ],
  [TEMPORAL]: [
    {
      name: "!=",
      get verboseName() {
        return t`Excludes`;
      },
    },
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "<",
      get verboseName() {
        return t`Before`;
      },
    },
    {
      name: ">",
      get verboseName() {
        return t`After`;
      },
    },
    {
      name: "between",
      get verboseName() {
        return t`Between`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Is not empty`;
      },
    },
  ],
  [LOCATION]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Is not`;
      },
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not empty`;
      },
    },
    {
      name: "contains",
      get verboseName() {
        return t`Contains`;
      },
    },
    {
      name: "does-not-contain",
      get verboseName() {
        return t`Does not contain`;
      },
    },
    {
      name: "starts-with",
      get verboseName() {
        return t`Starts with`;
      },
    },
    {
      name: "ends-with",
      get verboseName() {
        return t`Ends with`;
      },
    },
  ],
  [COORDINATE]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
    },
    {
      name: "!=",
      get verboseName() {
        return t`Is not`;
      },
    },
    {
      name: "inside",
      get verboseName() {
        return t`Inside`;
      },
    },
    {
      name: ">",
      get verboseName() {
        return t`Greater than`;
      },
    },
    {
      name: "<",
      get verboseName() {
        return t`Less than`;
      },
    },
    {
      name: "between",
      get verboseName() {
        return t`Between`;
      },
    },
    {
      name: ">=",
      get verboseName() {
        return t`Greater than or equal to`;
      },
    },
    {
      name: "<=",
      get verboseName() {
        return t`Less than or equal to`;
      },
    },
  ],
  [BOOLEAN]: [
    {
      name: "=",
      get verboseName() {
        return t`Is`;
      },
      multi: false,
    },
    {
      name: "is-null",
      get verboseName() {
        return t`Is empty`;
      },
    },
    {
      name: "not-null",
      get verboseName() {
        return t`Not empty`;
      },
    },
  ],
  [FOREIGN_KEY]: KEY_FILTER_OPERATORS,
  [PRIMARY_KEY]: KEY_FILTER_OPERATORS,
  [UNKNOWN]: DEFAULT_FILTER_OPERATORS,
};
