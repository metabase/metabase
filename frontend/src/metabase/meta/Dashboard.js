/* @flow */

import Question from "metabase-lib/lib/Question";

import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type Field from "metabase-lib/lib/metadata/Field";
import type { TemplateTag } from "metabase-types/types/Query";
import type { Card } from "metabase-types/types/Card";
import type {
  ParameterOption,
  Parameter,
  ParameterType,
  ParameterMappingUIOption,
} from "metabase-types/types/Parameter";

import Dimension, {
  FKDimension,
  JoinedDimension,
} from "metabase-lib/lib/Dimension";
import Variable, { TemplateTagVariable } from "metabase-lib/lib/Variable";

import { t } from "ttag";
import _ from "underscore";

import { slugify } from "metabase/lib/formatting";

type DimensionFilter = (dimension: Dimension) => boolean;
type TemplateTagFilter = (tag: TemplateTag) => boolean;
type FieldFilter = (field: Field) => boolean;
type VariableFilter = (variable: Variable) => boolean;

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
  options: ParameterOption[],
};

export const PARAMETER_SECTIONS: ParameterSection[] = [
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
  const sectionId = option.type.split("/")[0];
  let section = _.findWhere(PARAMETER_SECTIONS, { id: sectionId });
  if (!section) {
    section = _.findWhere(PARAMETER_SECTIONS, { id: "category" });
  }
  if (section) {
    section.options = section.options || [];
    section.options.push(option);
  }
}

function fieldFilterForParameter(parameter: Parameter) {
  return fieldFilterForParameterType(parameter.type);
}

function fieldFilterForParameterType(
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
      return (field: Field) => field.isCity();
    case "location/state":
      return (field: Field) => field.isState();
    case "location/zip_code":
      return (field: Field) => field.isZipCode();
    case "location/country":
      return (field: Field) => field.isCountry();
  }
  return (field: Field) => false;
}

export function parameterOptionsForField(field: Field): ParameterOption[] {
  return PARAMETER_OPTIONS.filter(option =>
    fieldFilterForParameterType(option.type)(field),
  );
}

function dimensionFilterForParameter(parameter: Parameter): DimensionFilter {
  const fieldFilter = fieldFilterForParameter(parameter);
  return dimension => fieldFilter(dimension.field());
}

function variableFilterForParameter(parameter: Parameter): VariableFilter {
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

export function getParameterMappingOptions(
  metadata: Metadata,
  parameter: ?Parameter = null,
  card: Card,
): ParameterMappingUIOption[] {
  const options = [];
  if (card.display === "text") {
    // text cards don't have parameters
    return [];
  }

  const query = new Question(card, metadata).query();

  // dimensions
  options.push(
    ...query
      .dimensionOptions(
        parameter ? dimensionFilterForParameter(parameter) : undefined,
      )
      .sections()
      .flatMap(section =>
        section.items.map(({ dimension }) => ({
          sectionName: section.name,
          name: dimension.displayName(),
          icon: dimension.icon(),
          target: ["dimension", dimension.mbql()],
          isForeign:
            dimension instanceof FKDimension ||
            dimension instanceof JoinedDimension,
        })),
      ),
  );

  // variables
  options.push(
    ...query
      .variables(parameter ? variableFilterForParameter(parameter) : undefined)
      .map(variable => ({
        sectionName: "Variables",
        name: variable.displayName(),
        icon: variable.icon(),
        target: ["variable", variable.mbql()],
      })),
  );

  return options;
}

export function createParameter(
  option: ParameterOption,
  parameters: Parameter[] = [],
): Parameter {
  let name = option.name;
  let nameIndex = 0;
  // get a unique name
  while (_.any(parameters, p => p.name === name)) {
    name = option.name + " " + ++nameIndex;
  }
  const parameter = {
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
  if (!name) {
    name = "unnamed";
  }
  const slug = slugify(name);
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
