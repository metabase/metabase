import _ from "underscore";

import { substitute_tags } from "cljs/metabase.shared.parameters.parameters";
import { withInstanceLanguage, siteLocale } from "metabase/lib/i18n";

export function fillParametersInText({
  dashcard,
  dashboard,
  parameterValues,
  text,
  escapeMarkdown = false,
}) {
  const parametersByTag = dashcard?.parameter_mappings?.reduce(
    (acc, mapping) => {
      const tagId = mapping.target[1];
      const parameter = dashboard.parameters?.find(
        p => p.id === mapping.parameter_id,
      );

      if (parameter) {
        const parameterValue = parameterValues[parameter.id];
        return {
          ...acc,
          [tagId]: { ...parameter, value: parameterValue },
        };
      }

      return acc;
    },
    {},
  );

  if (!_.isEmpty(parametersByTag)) {
    // Temporarily override language to use site language, so that all viewers of a dashboard see parameter values
    // translated the same way.
    return withInstanceLanguage(() =>
      substitute_tags(text, parametersByTag, siteLocale(), escapeMarkdown),
    );
  }

  return text;
}
