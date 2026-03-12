import _ from "underscore";

import { tag_names } from "cljs/metabase.parameters.shared";
import { isQuestionCard, isQuestionDashCard } from "metabase/dashboard/utils";
import { slugify } from "metabase/lib/formatting";
import { isNotNull } from "metabase/lib/types";
import { generateParameterId } from "metabase/parameters/utils/parameter-id";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  FieldFilterUiParameter,
  UiParameter,
} from "metabase-lib/v1/parameters/types";
import { isFieldFilterParameter } from "metabase-lib/v1/parameters/utils/parameter-type";
import {
  getParameterTargetField,
  getTextTagFromTarget,
  isParameterVariableTarget,
} from "metabase-lib/v1/parameters/utils/targets";
import type {
  Card,
  CardId,
  DashCardId,
  Dashboard,
  DashboardCard,
  DashboardParameterMapping,
  Parameter,
  ParameterTarget,
  QuestionDashboardCard,
} from "metabase-types/api";

type ExtendedMapping = DashboardParameterMapping & {
  dashcard_id: DashCardId;
  card: Card;
};

export type NewParameterOpts = Pick<Parameter, "name" | "type" | "sectionId">;

export function createParameter(
  opts: NewParameterOpts,
  parameters: Parameter[] = [],
) {
  let baseName = opts.name;
  let nameIndex = 0;

  // Extract base name and existing index if present
  const indexMatch = baseName.match(/^(.+)\s+(\d+)$/);
  if (indexMatch) {
    baseName = indexMatch[1];
    nameIndex = parseInt(indexMatch[2], 10);
  }

  let name = nameIndex === 0 ? baseName : `${baseName} ${nameIndex}`;

  while (parameters.some((p) => p.name === name)) {
    nameIndex++;
    name = `${baseName} ${nameIndex}`;
  }

  const parameter: Parameter = {
    name: "",
    slug: "",
    id: generateParameterId(),
    type: opts.type,
    sectionId: opts.sectionId,
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

export function getSavedDashboardUiParameters(
  dashcards: Dashboard["dashcards"],
  parameters: Dashboard["parameters"],
  parameterFields: Dashboard["param_fields"],
  metadata: Metadata,
): UiParameter[] {
  const mappableDashcards = dashcards.filter(isQuestionDashCard);
  const mappings = getMappings(mappableDashcards);
  const uiParameters: UiParameter[] = (parameters || []).map((parameter) => {
    if (isFieldFilterParameter(parameter)) {
      return buildSavedDashboardParameter(
        parameter,
        mappings,
        parameterFields,
        metadata,
      );
    }

    return {
      ...parameter,
    };
  });

  return uiParameters;
}

export function getUnsavedDashboardUiParameters(
  dashcards: Dashboard["dashcards"],
  parameters: Dashboard["parameters"],
  metadata: Metadata,
  questions: Record<CardId, Question>,
): UiParameter[] {
  const mappableDashcards = dashcards.filter(isQuestionDashCard);
  const mappings = getMappings(mappableDashcards);
  const uiParameters: UiParameter[] = (parameters || []).map((parameter) => {
    if (isFieldFilterParameter(parameter)) {
      return buildUnsavedDashboardParameter(
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

function buildSavedDashboardParameter(
  parameter: Parameter,
  mappings: ExtendedMapping[],
  fields: Dashboard["param_fields"],
  metadata: Metadata,
) {
  const parameterMappings = mappings.filter(
    (mapping) => mapping.parameter_id === parameter.id,
  );
  const hasVariableTemplateTagTarget = parameterMappings.some((mapping) =>
    isParameterVariableTarget(mapping.target),
  );
  const parameterFields = (fields?.[parameter.id] ?? [])
    .map((field) => metadata.field(field.id))
    .filter(isNotNull);
  const uniqueParameterFields = _.uniq(parameterFields, (field) => field.id);

  return {
    ...parameter,
    fields: uniqueParameterFields,
    hasVariableTemplateTagTarget,
  };
}

function buildUnsavedDashboardParameter(
  parameter: Parameter,
  mappings: ExtendedMapping[],
  metadata: Metadata,
  questions: Record<CardId, Question>,
): FieldFilterUiParameter {
  const mappingsForParameter = mappings.filter(
    (mapping) => mapping.parameter_id === parameter.id,
  );
  const uniqueTargets: ParameterTarget[] = [];
  const uniqueMappingsForParameters = mappingsForParameter.filter((mapping) => {
    const isTargetUnique = uniqueTargets.every(
      (target) => _.isEqual(target, mapping.target) === false,
    );

    if (isTargetUnique) {
      uniqueTargets.push(mapping.target);
    }

    return isTargetUnique;
  });

  const mappedFields = uniqueMappingsForParameters.map((mapping) => {
    const { target, card } = mapping;
    if (!isQuestionCard(card)) {
      return null;
    }

    const question = questions[card.id] ?? new Question(card, metadata);
    try {
      return getParameterTargetField(question, parameter, target);
    } catch (e) {
      console.error("Error getting a field from a card", { card });
      throw e;
    }
  });

  const hasVariableTemplateTagTarget = mappingsForParameter.some((mapping) => {
    return isParameterVariableTarget(mapping.target);
  });

  const fields = mappedFields.filter(isNotNull);

  return {
    ...parameter,
    fields: _.uniq(fields, (field) => field.id),
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

export const getFilteredParameterMappingsForDashcardText = (
  parameterMappings: DashboardCard["parameter_mappings"],
  dashcardText: string,
) => {
  if (!parameterMappings) {
    return parameterMappings;
  }

  const tagNames = tag_names(dashcardText);

  return parameterMappings.filter((mapping) => {
    const target = mapping.target;

    const textTag = getTextTagFromTarget(target);

    // A different tag type (not a text-tag) or no tag at all means we keep the mapping
    if (!textTag) {
      return true;
    }

    return tagNames.includes(textTag);
  });
};
