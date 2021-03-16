import Question from "metabase-lib/lib/Question";

import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type { Card } from "metabase-types/types/Card";
import type {
  ParameterOption,
  Parameter,
  ParameterMappingUIOption,
} from "metabase-types/types/Parameter";

import {
  dimensionFilterForParameter,
  variableFilterForParameter,
  PARAMETER_OPTIONS,
} from "metabase/meta/Parameter";

import { t } from "ttag";
import _ from "underscore";

import { slugify } from "metabase/lib/formatting";

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
    id: "number",
    name: t`Number`,
    description: t`Subtotal, Age, Price, Quantity, etc.`,
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

  const question = new Question(card, metadata);
  const query = question.query();

  if (question.isStructured()) {
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
            isForeign: !!(dimension.fk() || dimension.joinAlias()),
          })),
        ),
    );
  } else {
    options.push(
      ...query
        .variables(
          parameter ? variableFilterForParameter(parameter) : undefined,
        )
        .map(variable => ({
          name: variable.displayName(),
          icon: variable.icon(),
          isForeign: false,
          target: ["variable", variable.mbql()],
        })),
    );
    options.push(
      ...query
        .dimensionOptions(
          parameter ? dimensionFilterForParameter(parameter) : undefined,
        )
        .sections()
        .flatMap(section =>
          section.items.map(({ dimension }) => ({
            name: dimension.displayName(),
            icon: dimension.icon(),
            isForeign: false,
            target: ["dimension", dimension.mbql()],
          })),
        ),
    );
  }

  return options;
}

export function createParameter(
  option: ParameterOption,
  parameters: Parameter[] = [],
): Parameter {
  let name = option.combinedName || option.name;
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
