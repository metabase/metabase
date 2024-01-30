import _ from "underscore";

import { generateParameterId } from "metabase/parameters/utils/parameter-id";
import { slugify } from "metabase/lib/formatting";
import type {
  Card,
  Dashboard,
  DashboardParameterMapping,
  DashboardCard,
  Parameter,
  ParameterMappingOptions,
} from "metabase-types/api";
import { isFieldFilterParameter } from "metabase-lib/parameters/utils/parameter-type";
import type {
  UiParameter,
  FieldFilterUiParameter,
  ParameterWithTarget,
} from "metabase-lib/parameters/types";
import {
  getTargetFieldFromCard,
  isVariableTarget,
} from "metabase-lib/parameters/utils/targets";
import type Metadata from "metabase-lib/metadata/Metadata";
import type Field from "metabase-lib/metadata/Field";

type ExtendedMapping = DashboardParameterMapping & {
  dashcard_id: number;
  card: Card;
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

  const parameter: Parameter = {
    name: "",
    slug: "",
    id: generateParameterId(),
    type: option.type,
    sectionId: option.sectionId,
  };

  return setParameterName(parameter, name);
}

export function setParameterName(
  parameter: Parameter,
  name: string,
): Parameter {
  const slug = slugify(name);
  return {
    ...parameter,
    name: name,
    slug: slug,
  };
}

export function getIsMultiSelect(parameter: Parameter): boolean {
  return parameter.isMultiSelect == null ? true : parameter.isMultiSelect;
}

export function hasMapping(parameter: Parameter, dashboard: Dashboard) {
  return dashboard.dashcards.some(dashcard => {
    return dashcard?.parameter_mappings?.some(parameter_mapping => {
      return parameter_mapping.parameter_id === parameter.id;
    });
  });
}

export function isDashboardParameterWithoutMapping(
  parameter: Parameter,
  dashboard: Dashboard,
) {
  if (!dashboard || !dashboard.parameters) {
    return false;
  }

  const parameterExistsOnDashboard = dashboard.parameters.some(
    dashParam => dashParam.id === parameter.id,
  );
  const parameterHasMapping = hasMapping(parameter, dashboard);

  return parameterExistsOnDashboard && !parameterHasMapping;
}

function getMappings(dashcards: DashboardCard[]): ExtendedMapping[] {
  return dashcards.flatMap(dashcard => {
    const { parameter_mappings, card, series } = dashcard;
    const cards = [card, ...(series || [])];
    const res = (parameter_mappings || [])
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
      .filter((mapping): mapping is ExtendedMapping => mapping != null);
    return res;
  });
}

export function getDashboardUiParameters(
  dashboard: Dashboard,
  metadata: Metadata,
): UiParameter[] {
  const { parameters, dashcards } = dashboard;
  const mappings = getMappings(dashcards as DashboardCard[]);
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
  mappings: ExtendedMapping[],
  metadata: Metadata,
): FieldFilterUiParameter {
  const mappingsForParameter = mappings.filter(
    mapping => mapping.parameter_id === parameter.id,
  );
  const uniqueMappingsForParameters = _.uniq(mappingsForParameter, mapping =>
    JSON.stringify(mapping.target),
  );

  const mappedFields = uniqueMappingsForParameters.map(mapping => {
    const { target, card } = mapping;

    try {
      const field = getTargetFieldFromCard(target, card, metadata);

      return {
        field,
        // The `dataset_query` is null for questions on a dashboard the user doesn't have access to
        shouldResolveFkField: card.dataset_query?.type === "query",
      };
    } catch (e) {
      console.error("Error getting a field from a card", { card });
      throw e;
    }
  });

  const hasVariableTemplateTagTarget = mappingsForParameter.some(mapping => {
    return isVariableTarget(mapping.target);
  });

  const fields = mappedFields
    .filter(
      (
        mappedField,
      ): mappedField is { field: Field; shouldResolveFkField: boolean } => {
        return mappedField.field != null;
      },
    )
    .map(({ field, shouldResolveFkField }) => {
      return shouldResolveFkField ? field.target ?? field : field;
    });

  return {
    ...parameter,
    fields,
    hasVariableTemplateTagTarget,
  };
}

export function getParametersMappedToDashcard(
  dashboard: Dashboard,
  dashcard: DashboardCard,
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
  cardId: number;
  parameters: Parameter[];
}) {
  const dashcard = _.findWhere(dashboard.dashcards, {
    id: dashcardId,
    card_id: cardId,
  });
  if (!dashcard) {
    return false;
  }

  const mappings = getMappings(dashboard.dashcards as DashboardCard[]);
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
) {
  const { filteringParameters = [] } = parameter || {};
  const filteringParameterValues = Object.fromEntries(
    parameters
      .filter(p => filteringParameters.includes(p.id) && p.value != null)
      .map(p => [p.id, p.value]),
  );

  return filteringParameterValues;
}
