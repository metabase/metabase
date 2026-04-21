import type Question from "metabase-lib/v1/Question";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterValuesMap } from "metabase-types/api";

export const getGuestEmbedFilteredParameters = (
  question: Question,
  parameterValues: ParameterValuesMap | undefined,
) => {
  const parameters = getParameterValuesBySlug(
    question.card().parameters,
    parameterValues,
  );

  return Object.fromEntries(
    Object.entries(parameters).filter(([_key, value]) => value !== null),
  );
};
