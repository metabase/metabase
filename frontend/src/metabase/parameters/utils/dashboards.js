import _ from "underscore";
import { setIn } from "icepick";

import Question from "metabase-lib/lib/Question";
import { getParameterTargetField } from "metabase/parameters/utils/targets";
import { slugify } from "metabase/lib/formatting";

export function createParameter(option, parameters = []) {
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

export function setParameterName(parameter, name) {
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

export function setParameterDefaultValue(parameter, value) {
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

export function getMappingTargetField(card, mapping, metadata) {
  if (!card?.dataset_query) {
    return null;
  }

  const question = new Question(card, metadata);
  const field = getParameterTargetField(mapping.target, metadata, question);
  return field;
}

function getMapping(dashcard, metadata) {
  const cards = [dashcard.card, ...(dashcard.series || [])];
  return (dashcard.parameter_mappings || []).map(mapping => {
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
}

function getMappings(dashboard, metadata) {
  const mappings = dashboard.ordered_cards.flatMap(dashcard =>
    getMapping(dashcard, metadata),
  );

  return mappings;
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

export function getParametersMappedToDashcard(dashboard, dashcard) {
  const { parameters = [] } = dashboard;
  const { parameter_mappings } = dashcard;
  return parameters
    .map(parameter => {
      const mapping = _.findWhere(parameter_mappings, {
        parameter_id: parameter.id,
      });

      if (mapping) {
        return {
          ...parameter,
          target: mapping.target,
        };
      }
    })
    .filter(Boolean);
}

export function hasMatchingParameters({
  dashboard,
  dashcardId,
  cardId,
  parameters,
  metadata,
}) {
  const dashcard = _.findWhere(dashboard.ordered_cards, {
    id: dashcardId,
    card_id: cardId,
  });
  if (!dashcard) {
    return false;
  }

  const dashcardMappingsByParameterId = _.indexBy(
    getMapping(dashcard, metadata),
    "parameter_id",
  );

  return parameters.every(parameter => {
    return dashcardMappingsByParameterId[parameter.id] != null;
  });
}

export function getFilteringParameterValuesMap(parameter, parameters) {
  const { filteringParameters = [] } = parameter || {};
  const filteringParameterValues = Object.fromEntries(
    parameters
      .filter(p => filteringParameters.includes(p.id) && p.value != null)
      .map(p => [p.id, p.value]),
  );

  return filteringParameterValues;
}

export function getParameterValuesSearchKey({
  dashboardId,
  parameterId,
  query = null,
  filteringParameterValues = {},
}) {
  const BY_PARAMETER_ID = "0";
  // sorting the filteringParameterValues map by its parameter id key to ensure entry order doesn't affect the outputted cache key
  const sortedParameterValues = _.sortBy(
    Object.entries(filteringParameterValues),
    BY_PARAMETER_ID,
  );
  const stringifiedParameterValues = JSON.stringify(sortedParameterValues);

  return `dashboardId: ${dashboardId}, parameterId: ${parameterId}, query: ${query}, filteringParameterValues: ${stringifiedParameterValues}`;
}
