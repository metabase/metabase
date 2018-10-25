/* @flow */

import Metadata from "metabase-lib/lib/metadata/Metadata";
import Table from "metabase-lib/lib/metadata/Table";
import Field from "metabase-lib/lib/metadata/Field";

import type { FieldId } from "./types/Field";
import type { TemplateTag } from "./types/Query";
import type { Card } from "./types/Card";
import type {
  ParameterOption,
  Parameter,
  ParameterType,
  ParameterMappingUIOption,
  DimensionTarget,
  VariableTarget,
} from "./types/Parameter";
import { t } from "c-3po";
import { getTemplateTags } from "./Card";

import { slugify, stripId } from "metabase/lib/formatting";
import Query from "metabase/lib/query";
import { TYPE, isa } from "metabase/lib/types";

import _ from "underscore";

export const PARAMETER_OPTIONS: Array<ParameterOption> = [
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
    type: "location/city",
    name: t`City`,
  },
  {
    type: "location/state",
    name: t`State`,
  },
  {
    type: "location/zip_code",
    name: t`ZIP or Postal Code`,
  },
  {
    type: "location/country",
    name: t`Country`,
  },
  {
    type: "id",
    name: t`ID`,
  },
  {
    type: "category",
    name: t`Category`,
  },
];

export type ParameterSection = {
  id: string,
  name: string,
  description: string,
  options: Array<ParameterOption>,
};

export const PARAMETER_SECTIONS: Array<ParameterSection> = [
  {
    id: "date",
    name: t`Time`,
    description: t`Date range, relative date, time of day, etc.`,
    options: [],
  },
  {
    id: "location",
    name: t`Location`,
    description: t`City, State, Country, ZIP code.`,
    options: [],
  },
  {
    id: "id",
    name: t`ID`,
    description: t`User ID, product ID, event ID, etc.`,
    options: [],
  },
  {
    id: "category",
    name: t`Other Categories`,
    description: t`Category, Type, Model, Rating, etc.`,
    options: [],
  },
];

for (const option of PARAMETER_OPTIONS) {
  let sectionId = option.type.split("/")[0];
  let section = _.findWhere(PARAMETER_SECTIONS, { id: sectionId });
  if (!section) {
    section = _.findWhere(PARAMETER_SECTIONS, { id: "category" });
  }
  if (section) {
    section.options = section.options || [];
    section.options.push(option);
  }
}

type Dimension = {
  name: string,
  parentName: string,
  target: DimensionTarget,
  field_id: number,
  depth: number,
};

type Variable = {
  name: string,
  target: VariableTarget,
  type: string,
};

type FieldFilter = (field: Field) => boolean;
type TemplateTagFilter = (tag: TemplateTag) => boolean;

export function getFieldDimension(field: Field): Dimension {
  return {
    name: field.display_name,
    field_id: field.id,
    parentName: field.table.display_name,
    target: ["field-id", field.id],
    depth: 0,
  };
}

export function getTagDimension(
  tag: TemplateTag,
  dimension: Dimension,
): Dimension {
  return {
    name: dimension.name,
    parentName: dimension.parentName,
    target: ["template-tag", tag.name],
    field_id: dimension.field_id,
    depth: 0,
  };
}

export function getCardDimensions(
  metadata: Metadata,
  card: Card,
  filter: FieldFilter = () => true,
): Array<Dimension> {
  if (card.dataset_query.type === "query") {
    const table =
      card.dataset_query.query["source-table"] != null
        ? metadata.tables[card.dataset_query.query["source-table"]]
        : null;
    if (table) {
      return getTableDimensions(table, 1, filter);
    }
  } else if (card.dataset_query.type === "native") {
    let dimensions = [];
    for (const tag of getTemplateTags(card)) {
      if (
        tag.type === "dimension" &&
        Array.isArray(tag.dimension) &&
        tag.dimension[0] === "field-id"
      ) {
        const field = metadata.fields[tag.dimension[1]];
        if (field && filter(field)) {
          let fieldDimension = getFieldDimension(field);
          dimensions.push(getTagDimension(tag, fieldDimension));
        }
      }
    }
    return dimensions;
  }
  return [];
}

function getDimensionTargetFieldId(target: DimensionTarget): ?FieldId {
  if (Array.isArray(target) && target[0] === "template-tag") {
    return null;
  } else {
    return Query.getFieldTargetId(target);
  }
}

export function getTableDimensions(
  table: Table,
  depth: number,
  filter: FieldFilter = () => true,
): Array<Dimension> {
  return _.chain(table.fields)
    .map(field => {
      let targetField = field.target;
      if (targetField && depth > 0) {
        let targetTable = targetField.table;
        return getTableDimensions(targetTable, depth - 1, filter).map(
          (dimension: Dimension) => ({
            ...dimension,
            parentName: stripId(field.display_name),
            target: [
              "fk->",
              field.id,
              getDimensionTargetFieldId(dimension.target),
            ],
            depth: dimension.depth + 1,
          }),
        );
      } else if (filter(field)) {
        return [getFieldDimension(field)];
      }
    })
    .flatten()
    .filter(dimension => dimension != null)
    .value();
}

export function getCardVariables(
  metadata: Metadata,
  card: Card,
  filter: TemplateTagFilter = () => true,
): Array<Variable> {
  if (card.dataset_query.type === "native") {
    let variables = [];
    for (const tag of getTemplateTags(card)) {
      if (!filter || filter(tag)) {
        variables.push({
          name: tag["display-name"] || tag.name,
          type: tag.type,
          target: ["template-tag", tag.name],
        });
      }
    }
    return variables;
  }
  return [];
}

function fieldFilterForParameter(parameter: Parameter) {
  return fieldFilterForParameterType(parameter.type);
}

export function fieldFilterForParameterType(
  parameterType: ParameterType,
): FieldFilter {
  const [type] = parameterType.split("/");
  switch (type) {
    case "date":
      return (field: Field) => field.isDate();
    case "id":
      return (field: Field) => field.isID();
    case "category":
      return (field: Field) => field.isCategory();
  }

  switch (parameterType) {
    case "location/city":
      return (field: Field) => isa(field.special_type, TYPE.City);
    case "location/state":
      return (field: Field) => isa(field.special_type, TYPE.State);
    case "location/zip_code":
      return (field: Field) => isa(field.special_type, TYPE.ZipCode);
    case "location/country":
      return (field: Field) => isa(field.special_type, TYPE.Country);
  }
  return (field: Field) => false;
}

export function parameterOptionsForField(field: Field): ParameterOption[] {
  return PARAMETER_OPTIONS.filter(option =>
    fieldFilterForParameterType(option.type)(field),
  );
}

function tagFilterForParameter(parameter: Parameter): TemplateTagFilter {
  const [type, subtype] = parameter.type.split("/");
  switch (type) {
    case "date":
      return (tag: TemplateTag) => subtype === "single" && tag.type === "date";
    case "location":
      return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
    case "id":
      return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
    case "category":
      return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
  }
  return (tag: TemplateTag) => false;
}

const VARIABLE_ICONS = {
  text: "string",
  number: "int",
  date: "calendar",
};

export function getParameterMappingOptions(
  metadata: Metadata,
  parameter: Parameter,
  card: Card,
): Array<ParameterMappingUIOption> {
  let options = [];

  // dimensions
  options.push(
    ...getCardDimensions(
      metadata,
      card,
      fieldFilterForParameter(parameter),
    ).map((dimension: Dimension) => {
      const field = metadata.fields[dimension.field_id];
      return {
        name: dimension.name,
        target: ["dimension", dimension.target],
        icon: field && field.icon(),
        sectionName: dimension.parentName,
        isFk: dimension.depth > 0,
      };
    }),
  );

  // variables
  options.push(
    ...getCardVariables(metadata, card, tagFilterForParameter(parameter)).map(
      (variable: Variable) => ({
        name: variable.name,
        target: ["variable", variable.target],
        icon: VARIABLE_ICONS[variable.type],
        sectionName: "Variables",
        isVariable: true,
      }),
    ),
  );

  return options;
}

export function createParameter(
  option: ParameterOption,
  parameters: Array<ParameterOption> = [],
): Parameter {
  let name = option.name;
  let nameIndex = 0;
  // get a unique name
  while (_.any(parameters, p => p.name === name)) {
    name = option.name + " " + ++nameIndex;
  }
  let parameter = {
    name: "",
    slug: "",
    id: Math.floor(Math.random() * Math.pow(2, 32)).toString(16),
    type: option.type,
  };
  return setParameterName(parameter, name);
}

export function setParameterName(
  parameter: Parameter,
  name: string,
): Parameter {
  let slug = slugify(name);
  return {
    ...parameter,
    name: name,
    slug: slug,
  };
}

export function setParameterDefaultValue(
  parameter: Parameter,
  value: string,
): Parameter {
  return {
    ...parameter,
    default: value,
  };
}
