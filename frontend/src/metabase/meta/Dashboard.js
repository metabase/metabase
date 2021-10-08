import _ from "underscore";
import { setIn } from "icepick";
import { t } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import Question from "metabase-lib/lib/Question";
import Field from "metabase-lib/lib/metadata/Field";

import { ExpressionDimension } from "metabase-lib/lib/Dimension";

import type Metadata from "metabase-lib/lib/metadata/Metadata";
import type { Card } from "metabase-types/types/Card";
import type {
  ParameterOption,
  Parameter,
  ParameterMappingUIOption,
} from "metabase-types/types/Parameter";

import {
  dimensionFilterForParameter,
  getTagOperatorFilterForParameter,
  variableFilterForParameter,
  getParameterOptions,
  PARAMETER_OPERATOR_TYPES,
  getOperatorDisplayName,
  getParameterTargetFieldId,
} from "metabase/meta/Parameter";

import { slugify } from "metabase/lib/formatting";

export type ParameterSection = {
  id: string,
  name: string,
  description: string,
  options: ParameterOption[],
};

const areFieldFilterOperatorsEnabled = () =>
  MetabaseSettings.get("field-filter-operators-enabled?");

const LOCATION_OPTIONS = [
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
];
const CATEGORY_OPTIONS = [{ type: "category", name: t`Category` }];

export function getParameterSections(): ParameterSection[] {
  const parameterOptions = getParameterOptions();

  return [
    {
      id: "date",
      name: t`Time`,
      description: t`Date range, relative date, time of day, etc.`,
      options: PARAMETER_OPERATOR_TYPES["date"].map(option => {
        return {
          ...option,
          sectionId: "date",
          combinedName: getOperatorDisplayName(option, "date", t`Date`),
        };
      }),
    },
    {
      id: "location",
      name: t`Location`,
      description: t`City, State, Country, ZIP code.`,
      options: areFieldFilterOperatorsEnabled()
        ? PARAMETER_OPERATOR_TYPES["string"].map(option => {
            return {
              ...option,
              sectionId: "location",
              combinedName: getOperatorDisplayName(
                option,
                "string",
                t`Location`,
              ),
            };
          })
        : LOCATION_OPTIONS,
    },

    {
      id: "id",
      name: t`ID`,
      description: t`User ID, Product ID, Event ID, etc.`,
      options: [
        {
          ..._.findWhere(parameterOptions, { type: "id" }),
          sectionId: "id",
        },
      ],
    },
    areFieldFilterOperatorsEnabled() && {
      id: "number",
      name: t`Number`,
      description: t`Subtotal, Age, Price, Quantity, etc.`,
      options: PARAMETER_OPERATOR_TYPES["number"].map(option => {
        return {
          ...option,
          sectionId: "number",
          combinedName: getOperatorDisplayName(option, "number", t`Number`),
        };
      }),
    },
    areFieldFilterOperatorsEnabled()
      ? {
          id: "string",
          name: t`Text or Category`,
          description: t`Name, Rating, Description, etc.`,
          options: PARAMETER_OPERATOR_TYPES["string"].map(option => {
            return {
              ...option,
              sectionId: "string",
              combinedName: getOperatorDisplayName(option, "string", t`Text`),
            };
          }),
        }
      : {
          id: "category",
          name: t`Other Categories`,
          description: t`Category, Type, Model, Rating, etc.`,
          options: CATEGORY_OPTIONS,
        },
  ].filter(Boolean);
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
            // these methods don't exist on instances of ExpressionDimension
            isForeign: !!(dimension instanceof ExpressionDimension
              ? false
              : dimension.fk() || dimension.joinAlias()),
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
          parameter ? getTagOperatorFilterForParameter(parameter) : undefined,
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
    name = (option.combinedName || option.name) + " " + ++nameIndex;
  }

  const parameter = {
    name: "",
    slug: "",
    id: Math.floor(Math.random() * Math.pow(2, 32)).toString(16),
    type: option.type,
    sectionId: option.sectionId,
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

export function hasMapping(parameter, dashboard) {
  return dashboard.ordered_cards.some(ordered_card => {
    return ordered_card?.parameter_mappings?.some(parameter_mapping => {
      return parameter_mapping.parameter_id === parameter.id;
    });
  });
}

export function isDashboardParameterWithoutMapping(parameter, dashboard) {
  if (!dashboard) {
    return false;
  }

  const parameterExistsOnDashboard = dashboard.parameters.some(
    dashParam => dashParam.id === parameter.id,
  );
  const parameterHasMapping = hasMapping(parameter, dashboard);

  return parameterExistsOnDashboard && !parameterHasMapping;
}

function getMappingTargetField(card, mapping, metadata) {
  if (!card) {
    return null;
  }

  const fieldId = getParameterTargetFieldId(mapping.target, card.dataset_query);
  let field = metadata.field(fieldId);

  if (!field) {
    const rawField = _.findWhere(card.result_metadata, {
      name: fieldId,
    });
    field = rawField && new Field(rawField, metadata);
  }

  return field;
}

function augmentMappingsWithValueMetadata(mappings) {
  const mappingsGroupedByParameterId = _.groupBy(mappings, "parameter_id");

  _.each(mappingsGroupedByParameterId, mappingsGroup => {
    const mappingsWithValues = mappingsGroup
      .map(mapping => [mapping, mapping.field?.fieldValues() ?? []])
      .filter(([, values]) => values.length > 0);
    const values = mappingsWithValues
      .map(([, values]) => values)
      .flat()
      .map(value => (Array.isArray(value) ? value[0] : value));

    const distinctValues = new Set(values);

    const hasMultipleMappingsWithValues = mappingsWithValues.length > 1;
    const hasDisjointValueSets =
      hasMultipleMappingsWithValues && distinctValues.size === values.length;

    mappingsWithValues.forEach(([mapping]) => {
      mapping.hasDisjointValueSets = hasDisjointValueSets;
    });
  });

  return mappings;
}

function getMappings(dashboard, metadata) {
  const mappings = dashboard.ordered_cards
    .map(dashcard => {
      const cards = [dashcard.card].concat(dashcard.series);
      return dashcard.parameter_mappings.map(mapping => {
        const card = _.findWhere(cards, { id: mapping.card_id });
        const field = getMappingTargetField(card, mapping, metadata);

        return {
          ...mapping,
          parameter_id: mapping.parameter_id,
          dashcard_id: dashcard.id,
          card_id: mapping.card_id,
          field_id: field?.id ?? field?.name,
          field,
        };
      });
    })
    .flat();

  return augmentMappingsWithValueMetadata(mappings);
}

export function getMappingsByParameter(metadata, dashboard) {
  if (!dashboard) {
    return {};
  }

  const mappings = getMappings(dashboard, metadata);
  const mappingsByParameterIdByDashcardIdByCardId = mappings.reduce(
    (map, mapping) =>
      setIn(
        map,
        [mapping.parameter_id, mapping.dashcard_id, mapping.card_id],
        mapping,
      ),
    {},
  );

  return mappingsByParameterIdByDashcardIdByCardId;
}

export function getDashboardParametersWithFieldMetadata(
  metadata,
  dashboard,
  mappingsByParameter,
) {
  return ((dashboard && dashboard.parameters) || []).map(parameter => {
    const mappings = _.flatten(
      _.map(mappingsByParameter[parameter.id] || {}, _.values),
    );

    // we change out widgets if a parameter is connected to non-field targets
    const hasOnlyFieldTargets = mappings.every(x => x.field_id != null);

    const fields = _.uniq(
      mappings
        .map(mapping => mapping.field)
        .filter(field => field != null)
        .map(field => field.target ?? field),
      field => field.id,
    );

    // get the unique list of field IDs these mappings reference
    const fieldIds = _.chain(mappings)
      .map(m => m.field_id)
      .uniq()
      .filter(fieldId => fieldId != null)
      .value();

    const fieldIdsWithFKResolved = _.chain(fieldIds)
      .map(id => metadata.field(id))
      .filter(f => f)
      .map(f => (f.target || f).id)
      .uniq()
      .value();

    return {
      ...parameter,
      field_ids: fieldIds,
      // if there's a single uniqe field (accounting for FKs) then
      // include it as the one true field_id
      field_id:
        fieldIdsWithFKResolved.length === 1 ? fieldIdsWithFKResolved[0] : null,
      fields,
      hasOnlyFieldTargets,
    };
  });
}
