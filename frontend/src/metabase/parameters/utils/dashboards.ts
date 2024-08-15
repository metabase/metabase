import _ from "underscore";

import { isQuestionCard, isQuestionDashCard } from "metabase/dashboard/utils";
import { slugify } from "metabase/lib/formatting";
import { generateParameterId } from "metabase/parameters/utils/parameter-id";
import Question from "metabase-lib/v1/Question";
import type Field from "metabase-lib/v1/metadata/Field";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  UiParameter,
  FieldFilterUiParameter,
} from "metabase-lib/v1/parameters/types";
import { isFieldFilterParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import {
  getParameterTargetField,
  isParameterVariableTarget,
} from "metabase-lib/v1/parameters/utils/targets";
import type {
  Card,
  Dashboard,
  DashboardParameterMapping,
  QuestionDashboardCard,
  Parameter,
  ParameterMappingOptions,
  DashCardId,
  CardId,
  ParameterTarget,
} from "metabase-types/api";

type ExtendedMapping = DashboardParameterMapping & {
  dashcard_id: DashCardId;
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

export function setParameterType(
  parameter: Parameter,
  type: string,
  sectionId: string,
): Parameter {
  // reset default value
  const {
    default: _,
    values_source_type,
    values_source_config,
    values_query_type,
    ...rest
  } = parameter;

  return {
    ...rest,
    type,
    sectionId,
  };
}

export function hasMapping(parameter: Parameter, dashboard: Dashboard) {
  return dashboard.dashcards.some(dashcard => {
    return dashcard?.parameter_mappings?.some(parameter_mapping => {
      return parameter_mapping.parameter_id === parameter.id;
    });
  });
}

function getMappings(dashcards: QuestionDashboardCard[]): ExtendedMapping[] {
  return dashcards.flatMap(dashcard => {
    const { parameter_mappings, card, series } = dashcard;
    const cards = [card, ...(series || [])];
    const extendedParameterMappings = (parameter_mappings || [])
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

    return extendedParameterMappings;
  });
}

export function getDashboardUiParameters(
  dashcards: Dashboard["dashcards"],
  parameters: Dashboard["parameters"],
  metadata: Metadata,
  questions: Record<CardId, Question>,
): UiParameter[] {
  const mappableDashcards = dashcards.filter(isQuestionDashCard);
  const mappings = getMappings(mappableDashcards);
  const uiParameters: UiParameter[] = (parameters || []).map(parameter => {
    if (isFieldFilterParameter(parameter)) {
      return buildFieldFilterUiParameter(
        parameter,
        mappings,
        metadata,
        questions,
      );
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
  questions: Record<CardId, Question>,
): FieldFilterUiParameter {
  const mappingsForParameter = mappings.filter(
    mapping => mapping.parameter_id === parameter.id,
  );
  const uniqueTargets: ParameterTarget[] = [];
  const uniqueMappingsForParameters = mappingsForParameter.filter(mapping => {
    const isTargetUnique = uniqueTargets.every(
      target => _.isEqual(target, mapping.target) === false,
    );

    if (isTargetUnique) {
      uniqueTargets.push(mapping.target);
    }

    return isTargetUnique;
  });

  const mappedFields = uniqueMappingsForParameters.map(mapping => {
    const { target, card } = mapping;
    if (!isQuestionCard(card)) {
      return {
        field: null,
        shouldResolveFkField: false,
      };
    }

    const question = questions[card.id] ?? new Question(card, metadata);
    try {
      const field = getParameterTargetField(question, parameter, target);

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
    return isParameterVariableTarget(mapping.target);
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
    fields: _.uniq(fields, field => field.id),
    hasVariableTemplateTagTarget,
  };
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

  const mappableParameters = dashboard.dashcards.filter(isQuestionDashCard);
  const mappings = getMappings(mappableParameters);
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
