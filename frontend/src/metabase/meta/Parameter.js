import type { DatasetQuery } from "metabase-types/types/Card";
import type {
  TemplateTag,
  LocalFieldReference,
  ForeignFieldReference,
  FieldFilter,
} from "metabase-types/types/Query";
import type {
  Parameter,
  ParameterOption,
  ParameterInstance,
  ParameterTarget,
  ParameterValue,
  ParameterValueOrArray,
  ParameterValues,
  ParameterType,
} from "metabase-types/types/Parameter";
import type { FieldId } from "metabase-types/types/Field";
import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type Field from "metabase-lib/lib/metadata/Field";
import Dimension, { FieldDimension } from "metabase-lib/lib/Dimension";
import moment from "moment";
import { t } from "ttag";
import _ from "underscore";
import * as FIELD_REF from "metabase/lib/query/field_ref";
import {
  isNumericBaseType,
  doesOperatorExist,
  getOperatorByTypeAndName,
  STRING,
  NUMBER,
  PRIMARY_KEY,
} from "metabase/lib/schema_metadata";

import Variable, { TemplateTagVariable } from "metabase-lib/lib/Variable";

type DimensionFilter = (dimension: Dimension) => boolean;
type TemplateTagFilter = (tag: TemplateTag) => boolean;
type FieldPredicate = (field: Field) => boolean;
type VariableFilter = (variable: Variable) => boolean;

export const PARAMETER_OPERATOR_TYPES = {
  number: [
    {
      operator: "=",
      name: t`Equal to`,
    },
    {
      operator: "!=",
      name: t`Not equal to`,
    },
    {
      operator: "between",
      name: t`Between`,
    },
    {
      operator: ">=",
      name: t`Greater than or equal to`,
    },
    {
      operator: "<=",
      name: t`Less than or equal to`,
    },
    // {
    //   operator: "all-options",
    //   name: t`All options`,
    //   description: t`Contains all of the above`,
    // },
  ],
  string: [
    {
      operator: "=",
      name: t`Dropdown`,
      description: t`Select one or more values from a list or search box.`,
    },
    {
      operator: "!=",
      name: t`Is not`,
      description: t`Exclude one or more specific values.`,
    },
    {
      operator: "contains",
      name: t`Contains`,
      description: t`Match values that contain the entered text.`,
    },
    {
      operator: "does-not-contain",
      name: t`Does not contain`,
      description: t`Filter out values that contain the entered text.`,
    },
    {
      operator: "starts-with",
      name: t`Starts with`,
      description: t`Match values that begin with the entered text.`,
    },
    {
      operator: "ends-with",
      name: t`Ends with`,
      description: t`Match values that end with the entered text.`,
    },
    // {
    //   operator: "all-options",
    //   name: t`All options`,
    //   description: t`Users can pick from any of the above`,
    // },
  ],
};

const OPTIONS_WITH_OPERATOR_SUBTYPES = [
  {
    section: "location",
    operatorType: "string",
    sectionName: t`Location`,
  },
  {
    section: "category",
    operatorType: "string",
    sectionName: t`Category`,
  },
  {
    section: "number",
    operatorType: "number",
    sectionName: t`Number`,
  },
];

export const PARAMETER_OPTIONS: ParameterOption[] = [
  {
    type: "date/month-year",
    name: t`Month and Year`,
    description: t`Like January, 2016`,
  },
  {
    type: "date/quarter-year",
    name: t`Quarter and Year`,
    description: t`Like Q1, 2016`,
  },
  {
    type: "date/single",
    name: t`Single Date`,
    description: t`Like January 31, 2016`,
  },
  {
    type: "date/range",
    name: t`Date Range`,
    description: t`Like December 25, 2015 - February 14, 2016`,
  },
  {
    type: "date/relative",
    name: t`Relative Date`,
    description: t`Like "the last 7 days" or "this month"`,
  },
  {
    type: "date/all-options",
    name: t`Date Filter`,
    menuName: t`All Options`,
    description: t`Contains all of the above`,
  },
  {
    type: "id",
    name: t`ID`,
  },
  ...OPTIONS_WITH_OPERATOR_SUBTYPES.map(option =>
    buildOperatorSubtypeOptions(option),
  ),
].flat();

function buildOperatorSubtypeOptions({ section, operatorType, sectionName }) {
  return PARAMETER_OPERATOR_TYPES[operatorType].map(option => ({
    ...option,
    combinedName:
      operatorType === "string" && option.operator === "="
        ? `${sectionName}`
        : sectionName === "Number"
        ? `${option.name}`
        : `${sectionName} ${option.name.toLowerCase()}`,
    type: `${section}/${option.operator}`,
  }));
}

function fieldFilterForParameter(parameter: Parameter) {
  return fieldFilterForParameterType(parameter.type);
}

function fieldFilterForParameterType(
  parameterType: ParameterType,
): FieldPredicate {
  const [type] = splitType(parameterType);
  switch (type) {
    case "date":
      return (field: Field) => field.isDate();
    case "id":
      return (field: Field) => field.isID();
    case "category":
      return (field: Field) => field.isCategory();
    case "location":
      return (field: Field) =>
        field.isCity() ||
        field.isState() ||
        field.isZipCode() ||
        field.isCountry();
    case "number":
      return (field: Field) => field.isNumber() && !field.isCoordinate();
  }

  return (field: Field) => false;
}

export function parameterOptionsForField(field: Field): ParameterOption[] {
  return PARAMETER_OPTIONS.filter(option =>
    fieldFilterForParameterType(option.type)(field),
  ).map(option => {
    return {
      ...option,
      name: option.combinedName || option.name,
    };
  });
}

export function dimensionFilterForParameter(
  parameter: Parameter,
): DimensionFilter {
  const fieldFilter = fieldFilterForParameter(parameter);
  return dimension => fieldFilter(dimension.field());
}

export function variableFilterForParameter(
  parameter: Parameter,
): VariableFilter {
  const tagFilter = tagFilterForParameter(parameter);
  return variable => {
    if (variable instanceof TemplateTagVariable) {
      const tag = variable.tag();
      return tag ? tagFilter(tag) : false;
    }
    return false;
  };
}

function tagFilterForParameter(parameter: Parameter): TemplateTagFilter {
  const [type, subtype] = splitType(parameter);
  const operator = getParameterOperatorName(subtype);
  if (operator !== "=") {
    return (tag: TemplateTag) => false;
  }

  switch (type) {
    case "date":
      return (tag: TemplateTag) => subtype === "single" && tag.type === "date";
    case "location":
      return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
    case "id":
      return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
    case "category":
      return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
    case "number":
      return (tag: TemplateTag) => tag.type === "number";
  }
  return (tag: TemplateTag) => false;
}

// NOTE: this should mirror `template-tag-parameters` in src/metabase/api/embed.clj
export function getTemplateTagParameters(tags: TemplateTag[]): Parameter[] {
  return tags
    .filter(
      tag =>
        tag.type != null && (tag["widget-type"] || tag.type !== "dimension"),
    )
    .map(tag => ({
      id: tag.id,
      type:
        tag["widget-type"] ||
        (tag.type === "date" ? "date/single" : "category"),
      target:
        tag.type === "dimension"
          ? ["dimension", ["template-tag", tag.name]]
          : ["variable", ["template-tag", tag.name]],
      name: tag["display-name"],
      slug: tag.name,
      default: tag.default,
    }));
}

export const getParametersBySlug = (
  parameters: Parameter[],
  parameterValues: ParameterValues,
): { [key: string]: string } => {
  const result = {};
  for (const parameter of parameters) {
    if (parameterValues[parameter.id] != null) {
      result[parameter.slug] = parameterValues[parameter.id];
    }
  }
  return result;
};

/** Returns the field ID that this parameter target points to, or null if it's not a dimension target. */
export function getParameterTargetFieldId(
  target: ?ParameterTarget,
  datasetQuery: ?DatasetQuery,
): ?FieldId {
  if (target && target[0] === "dimension") {
    const dimension = target[1];
    if (Array.isArray(dimension) && dimension[0] === "template-tag") {
      if (datasetQuery && datasetQuery.type === "native") {
        const templateTag =
          datasetQuery.native["template-tags"][String(dimension[1])];
        if (templateTag && templateTag.type === "dimension") {
          return FIELD_REF.getFieldTargetId(templateTag.dimension);
        }
      }
    } else {
      return FIELD_REF.getFieldTargetId(dimension);
    }
  }
  return null;
}

type Deserializer = { testRegex: RegExp, deserialize: DeserializeFn };
type DeserializeFn = (
  match: any[],
  fieldRef: LocalFieldReference | ForeignFieldReference,
) => FieldFilter;

const withTemporalUnit = (fieldRef, unit) => {
  const dimension =
    (fieldRef && FieldDimension.parseMBQLOrWarn(fieldRef)) ||
    new FieldDimension(null);

  return dimension.withTemporalUnit(unit).mbql();
};

const timeParameterValueDeserializers: Deserializer[] = [
  {
    testRegex: /^past([0-9]+)([a-z]+)s(~)?$/,
    deserialize: (matches, fieldRef) =>
      // $FlowFixMe: not matching TimeIntervalFilter for some reason
      ["time-interval", fieldRef, -parseInt(matches[0]), matches[1]].concat(
        matches[2] ? [{ "include-current": true }] : [],
      ),
  },
  {
    testRegex: /^next([0-9]+)([a-z]+)s(~)?$/,
    deserialize: (matches, fieldRef) =>
      // $FlowFixMe: not matching TimeIntervalFilter for some reason
      ["time-interval", fieldRef, parseInt(matches[0]), matches[1]].concat(
        matches[2] ? [{ "include-current": true }] : [],
      ),
  },
  {
    testRegex: /^this([a-z]+)$/,
    deserialize: (matches, fieldRef) => [
      "time-interval",
      fieldRef,
      "current",
      matches[0],
    ],
  },
  {
    testRegex: /^~([0-9-T:]+)$/,
    deserialize: (matches, fieldRef) => ["<", fieldRef, matches[0]],
  },
  {
    testRegex: /^([0-9-T:]+)~$/,
    deserialize: (matches, fieldRef) => [">", fieldRef, matches[0]],
  },
  {
    testRegex: /^(\d{4}-\d{2})$/,
    deserialize: (matches, fieldRef) => [
      "=",
      withTemporalUnit(fieldRef, "month"),
      moment(matches[0], "YYYY-MM").format("YYYY-MM-DD"),
    ],
  },
  {
    testRegex: /^(Q\d-\d{4})$/,
    deserialize: (matches, fieldRef) => [
      "=",
      withTemporalUnit(fieldRef, "quarter"),
      moment(matches[0], "[Q]Q-YYYY").format("YYYY-MM-DD"),
    ],
  },
  {
    testRegex: /^([0-9-T:]+)$/,
    deserialize: (matches, fieldRef) => ["=", fieldRef, matches[0]],
  },
  {
    testRegex: /^([0-9-T:]+)~([0-9-T:]+)$/,
    deserialize: (matches, fieldRef) => [
      "between",
      fieldRef,
      matches[0],
      matches[1],
    ],
  },
];

export function dateParameterValueToMBQL(
  parameterValue: ParameterValue,
  fieldRef: LocalFieldReference | ForeignFieldReference,
): ?FieldFilter {
  const deserializer: ?Deserializer = timeParameterValueDeserializers.find(
    des => des.testRegex.test(parameterValue),
  );

  if (deserializer) {
    const substringMatches = deserializer.testRegex
      .exec(parameterValue)
      .splice(1);
    return deserializer.deserialize(substringMatches, fieldRef);
  } else {
    return null;
  }
}

export function stringParameterValueToMBQL(
  parameter: Parameter,
  fieldRef: LocalFieldReference | ForeignFieldReference,
): ?FieldFilter {
  const parameterValue: ParameterValueOrArray = parameter.value;
  const [, subtype] = splitType(parameter);
  const operatorName = getParameterOperatorName(subtype);

  return [operatorName, fieldRef].concat(parameterValue);
}

export function numberParameterValueToMBQL(
  parameter: ParameterInstance,
  fieldRef: LocalFieldReference | ForeignFieldReference,
): ?FieldFilter {
  const parameterValue: ParameterValue = parameter.value;
  const [, subtype] = splitType(parameter);
  const operatorName = getParameterOperatorName(subtype);

  return [operatorName, fieldRef].concat(
    [].concat(parameterValue).map(v => parseFloat(v)),
  );
}

/** compiles a parameter with value to an MBQL clause */
export function parameterToMBQLFilter(
  parameter: ParameterInstance,
  metadata: Metadata,
): ?FieldFilter {
  if (
    !parameter.target ||
    parameter.target[0] !== "dimension" ||
    !Array.isArray(parameter.target[1]) ||
    parameter.target[1][0] === "template-tag"
  ) {
    return null;
  }

  // $FlowFixMe: doesn't understand parameter.target[1] is a field reference
  const fieldRef: LocalFieldReference | ForeignFieldReference =
    parameter.target[1];

  if (parameter.type.indexOf("date/") === 0) {
    return dateParameterValueToMBQL(parameter.value, fieldRef);
  } else {
    const fieldId = FIELD_REF.getFieldTargetId(fieldRef);
    const field = metadata.field(fieldId);
    // if the field is numeric, parse the value as a number
    if (isNumericBaseType(field)) {
      return numberParameterValueToMBQL(parameter, fieldRef);
    } else {
      return stringParameterValueToMBQL(parameter, fieldRef);
    }
  }
}

export function getParameterIconName(parameterType: ?ParameterType) {
  const [type] = splitType(parameterType);
  switch (type) {
    case "date":
      return "calendar";
    case "location":
      return "location";
    case "category":
      return "string";
    case "number":
      return "number";
    case "id":
    default:
      return "label";
  }
}

export function mapUIParameterToQueryParameter(type, value, target) {
  const [fieldType, maybeOperatorName] = splitType(type);
  const operatorName = getParameterOperatorName(maybeOperatorName);

  if (fieldType === "location" || fieldType === "category") {
    return {
      type: `string/${operatorName}`,
      value: [].concat(value),
      target,
    };
  } else if (fieldType === "number") {
    return {
      type,
      value: [].concat(value),
      target,
    };
  } else {
    return { type, value, target };
  }
}

function getParameterOperatorName(maybeOperatorName) {
  return doesOperatorExist(maybeOperatorName) ? maybeOperatorName : "=";
}

export function deriveFieldOperatorFromParameter(parameter) {
  const [parameterType, maybeOperatorName] = splitType(parameter);
  const operatorType = getParameterOperatorType(parameterType);
  const operatorName = getParameterOperatorName(maybeOperatorName);

  return getOperatorByTypeAndName(operatorType, operatorName);
}

function getParameterOperatorType(parameterType) {
  switch (parameterType) {
    case "number":
      return NUMBER;
    case "location":
    case "category":
      return STRING;
    case "id":
      // id can technically be a FK but doesn't matter as both use default filter operators
      return PRIMARY_KEY;
    default:
      return undefined;
  }
}

function splitType(parameterOrType) {
  const parameterType = _.isString(parameterOrType)
    ? parameterOrType
    : (parameterOrType || {}).type || "";
  return parameterType.split("/");
}

export function collateParametersWithValues(parameters, parameterValues) {
  if (parameterValues) {
    return parameters.map(p => ({
      ...p,
      value: parameterValues[p.id],
    }));
  } else {
    return parameters;
  }
}

export function hasDefaultParameterValue(parameter) {
  return parameter.default != null;
}

export function hasParameterValue(parameter) {
  return parameter && parameter.value != null;
}
