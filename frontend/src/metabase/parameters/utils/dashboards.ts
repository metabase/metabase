import _ from "underscore";

import Question from "metabase-lib/lib/Question";
import { getParameterTargetField } from "metabase/parameters/utils/targets";
import { isFieldFilterParameter } from "metabase/parameters/utils/parameter-type";
import { slugify } from "metabase/lib/formatting";
import {
  UiParameter,
  FieldFilterUiParameter,
  ParameterWithTarget,
} from "metabase/parameters/types";
import {
  ParameterId,
  Parameter,
  ParameterMappingOptions,
  ParameterDimensionTarget,
  ParameterVariableTarget,
} from "metabase-types/types/Parameter";
import {
  Dashboard,
  DashboardParameterMapping,
  DashboardOrderedCard,
} from "metabase-types/api";
import { SavedCard, CardId } from "metabase-types/types/Card";
import Metadata from "metabase-lib/lib/metadata/Metadata";
import Field from "metabase-lib/lib/metadata/Field";

type Mapping = DashboardParameterMapping & {
  dashcard_id: number;
  card: SavedCard;
};

export function createParameter(
  option: ParameterMappingOptions,
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
  value: any,
): Parameter {
  return {
    ...parameter,
    default: value,
  };
}

export function hasMapping(parameter: Parameter, dashboard: Dashboard) {
  return dashboard.ordered_cards.some(ordered_card => {
    return ordered_card?.parameter_mappings?.some(parameter_mapping => {
      return parameter_mapping.parameter_id === parameter.id;
    });
  });
}

export function isDashboardParameterWithoutMapping(
  parameter: Parameter,
  dashboard: Dashboard,
) {
  if (!dashboard) {
    return false;
  }

  const parameterExistsOnDashboard = dashboard.parameters?.some(
    dashParam => dashParam.id === parameter.id,
  );
  const parameterHasMapping = hasMapping(parameter, dashboard);

  return parameterExistsOnDashboard && !parameterHasMapping;
}

export function getDashboardUiParameters(
  dashboard: Dashboard,
  metadata: Metadata,
): UiParameter[] {
  const { parameters, ordered_cards } = dashboard;
  const mappings = getMappings(ordered_cards);
  const uiParameters: UiParameter[] = (parameters || []).map(parameter => {
    if (isFieldFilterParameter(parameter)) {
      return buildFieldFilterUiParameter(parameter, mappings, metadata);
    }

    return {
      ...parameter,
    };
  });

  return uiParameters;
}

function buildFieldFilterUiParameter(
  parameter: Parameter,
  mappings: Mapping[],
  metadata: Metadata,
): FieldFilterUiParameter {
  const mappingsForParameter = mappings.filter(
    mapping => mapping.parameter_id === parameter.id,
  );
  const mappedFields = mappingsForParameter.map(mapping => {
    const { target, card } = mapping;
    return getTargetField(target, card, metadata);
  });
  const fields = mappedFields.filter((field): field is Field => field != null);
  const hasOnlyFieldTargets =
    mappedFields.length !== 0 && mappedFields.length === fields.length;
  const uniqueFieldsWithFKResolved = _.uniq(
    fields.map(field => field.target ?? field),
    field => field.id,
  );

  return {
    ...parameter,
    fields: uniqueFieldsWithFKResolved,
    hasOnlyFieldTargets,
  };
}

function getMappings(ordered_cards: DashboardOrderedCard[]): Mapping[] {
  return ordered_cards.flatMap(dashcard => {
    const { parameter_mappings, card, series } = dashcard;
    const cards = [card, ...(series || [])];
    return (parameter_mappings || [])
      .map(parameter_mapping => {
        const card = _.findWhere(cards, { id: parameter_mapping.card_id });
        return card
          ? {
              ...parameter_mapping,
              dashcard_id: dashcard.id,
              card,
            }
          : null;
      })
      .filter((mapping): mapping is Mapping => mapping != null);
  });
}

export function getTargetField(
  target: ParameterVariableTarget | ParameterDimensionTarget,
  card: SavedCard,
  metadata: Metadata,
) {
  if (!card.dataset_query) {
    return null;
  }

  const question = new Question(card, metadata);
  const field = getParameterTargetField(target, metadata, question);
  return field ?? null;
}

export function getParametersMappedToDashcard(
  dashboard: Dashboard,
  dashcard: DashboardOrderedCard,
): ParameterWithTarget[] {
  const { parameters } = dashboard;
  const { parameter_mappings } = dashcard;
  return (parameters || [])
    .map(parameter => {
      const mapping = _.findWhere(parameter_mappings || [], {
        parameter_id: parameter.id,
      });

      if (mapping) {
        return {
          ...parameter,
          target: mapping.target,
        };
      }
    })
    .filter((parameter): parameter is ParameterWithTarget => parameter != null);
}

export function hasMatchingParameters({
  dashboard,
  dashcardId,
  cardId,
  parameters,
}: {
  dashboard: Dashboard;
  dashcardId: number;
  cardId: CardId;
  parameters: Parameter[];
  metadata: Metadata;
}) {
  const dashcard = _.findWhere(dashboard.ordered_cards, {
    id: dashcardId,
    card_id: cardId,
  });
  if (!dashcard) {
    return false;
  }

  const mappings = getMappings(dashboard.ordered_cards);
  const mappingsForDashcard = mappings.filter(
    mapping => mapping.dashcard_id === dashcardId,
  );

  const dashcardMappingsByParameterId = _.indexBy(
    mappingsForDashcard,
    "parameter_id",
  );

  return parameters.every(parameter => {
    return dashcardMappingsByParameterId[parameter.id] != null;
  });
}

export function getFilteringParameterValuesMap(
  parameter: UiParameter,
  parameters: UiParameter[],
): { [key: ParameterId]: any } {
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
}: {
  dashboardId: number;
  parameterId: ParameterId;
  query: string | null;
  filteringParameterValues: { [parameterId: number]: unknown };
}): string {
  const BY_PARAMETER_ID = "0";
  // sorting the filteringParameterValues map by its parameter id key to ensure entry order doesn't affect the outputted cache key
  const sortedParameterValues = _.sortBy(
    Object.entries(filteringParameterValues),
    BY_PARAMETER_ID,
  );
  const stringifiedParameterValues = JSON.stringify(sortedParameterValues);

  return `dashboardId: ${dashboardId}, parameterId: ${parameterId}, query: ${query}, filteringParameterValues: ${stringifiedParameterValues}`;
}
