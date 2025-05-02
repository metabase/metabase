import _ from "underscore";

import { isQuestionCard, isQuestionDashCard } from "metabase/dashboard/utils";
import { slugify } from "metabase/lib/formatting";
import { isNotNull } from "metabase/lib/types";
import { generateParameterId } from "metabase/parameters/utils/parameter-id";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import { isFieldFilterParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import { isParameterVariableTarget } from "metabase-lib/v1/parameters/utils/targets";
import type {
  Card,
  CardId,
  DashCardId,
  Dashboard,
  DashboardCard,
  DashboardParameterMapping,
  Parameter,
  ParameterMappingOptions,
  QuestionDashboardCard,
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
  while (_.any(parameters, (p) => p.name === name)) {
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
  return dashboard.dashcards.some((dashcard) => {
    return dashcard?.parameter_mappings?.some((parameter_mapping) => {
      return parameter_mapping.parameter_id === parameter.id;
    });
  });
}

function getMappings(dashcards: QuestionDashboardCard[]): ExtendedMapping[] {
  return dashcards.flatMap((dashcard) => {
    const { parameter_mappings, card, series } = dashcard;
    const cards = [card, ...(series || [])];
    const extendedParameterMappings = (parameter_mappings || [])
      .map((parameter_mapping) => {
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
  parameters: Dashboard["parameters"],
  dashcards: Dashboard["dashcards"],
  parameterFields: Dashboard["param_fields"],
  metadata: Metadata,
): UiParameter[] {
  const mappableDashcards = dashcards.filter(isQuestionDashCard);
  const mappings = getMappings(mappableDashcards);
  const uiParameters: UiParameter[] = (parameters || []).map((parameter) => {
    if (isFieldFilterParameter(parameter)) {
      const fields = (parameterFields ? parameterFields[parameter.id] : [])
        .map((field) => metadata.field(field.id))
        .filter(isNotNull);
      const hasVariableTemplateTagTarget = mappings.some(
        (mapping) =>
          mapping.parameter_id === parameter.id &&
          isParameterVariableTarget(mapping.target),
      );

      return {
        ...parameter,
        fields,
        hasVariableTemplateTagTarget,
      };
    }

    return {
      ...parameter,
    };
  });

  return uiParameters;
}

export function getDashboardQuestions(
  dashcards: DashboardCard[],
  metadata: Metadata,
) {
  return dashcards.reduce<Record<CardId, Question>>((acc, dashcard) => {
    if (isQuestionDashCard(dashcard)) {
      const cards = [dashcard.card, ...(dashcard.series ?? [])];

      for (const card of cards) {
        const question = isQuestionCard(card)
          ? new Question(card, metadata)
          : undefined;
        if (question) {
          acc[card.id] = question;
        }
      }
    }

    return acc;
  }, {});
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
    (mapping) => mapping.dashcard_id === dashcardId,
  );

  const dashcardMappingsByParameterId = _.indexBy(
    mappingsForDashcard,
    "parameter_id",
  );

  return parameters.every((parameter) => {
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
      .filter((p) => filteringParameters.includes(p.id) && p.value != null)
      .map((p) => [p.id, p.value]),
  );

  return filteringParameterValues;
}
