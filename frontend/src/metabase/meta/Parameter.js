/* @flow */

import type { DatasetQuery } from "metabase-types/types/Card";
import type {
  TemplateTag,
  LocalFieldReference,
  ForeignFieldReference,
  FieldFilter,
} from "metabase-types/types/Query";
import type {
  Parameter,
  ParameterInstance,
  ParameterTarget,
  ParameterValue,
  ParameterValueOrArray,
  ParameterValues,
  ParameterType,
} from "metabase-types/types/Parameter";
import type { FieldId } from "metabase-types/types/Field";
import type Metadata from "metabase-lib/lib/metadata/Metadata";

import moment from "moment";

import * as FIELD_REF from "metabase/lib/query/field_ref";

import { isNumericBaseType } from "metabase/lib/schema_metadata";

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
      ["datetime-field", fieldRef, "month"],
      moment(matches[0], "YYYY-MM").format("YYYY-MM-DD"),
    ],
  },
  {
    testRegex: /^(Q\d-\d{4})$/,
    deserialize: (matches, fieldRef) => [
      "=",
      ["datetime-field", fieldRef, "quarter"],
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
  parameterValue: ParameterValueOrArray,
  fieldRef: LocalFieldReference | ForeignFieldReference,
): ?FieldFilter {
  if (Array.isArray(parameterValue)) {
    // $FlowFixMe: thinks we're returning a nested array which concat does not do
    return ["=", fieldRef].concat(parameterValue);
  } else {
    return ["=", fieldRef, parameterValue];
  }
}

export function numberParameterValueToMBQL(
  parameterValue: ParameterValue,
  fieldRef: LocalFieldReference | ForeignFieldReference,
): ?FieldFilter {
  return ["=", fieldRef, parseFloat(parameterValue)];
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
      return numberParameterValueToMBQL(parameter.value, fieldRef);
    } else {
      return stringParameterValueToMBQL(parameter.value, fieldRef);
    }
  }
}

export function getParameterIconName(parameterType: ?ParameterType) {
  if (/^date\//.test(parameterType || "")) {
    return "calendar";
  } else if (/^location\//.test(parameterType || "")) {
    return "location";
  } else {
    return "label";
  }
}
