import _ from "underscore";

import { substitute_tags } from "cljs/metabase.parameters.shared";
import { siteLocale, withInstanceLanguage } from "metabase/lib/i18n";
import type {
  Dashboard,
  ParameterValuesMap,
  VirtualDashboardCard,
} from "metabase-types/api";

type FillParametersInTextProps = {
  dashcard?: VirtualDashboardCard;
  dashboard: Dashboard;
  parameterValues: ParameterValuesMap;
  text: string;
  escapeMarkdown?: boolean;
  urlEncode?: boolean;
};

export function fillParametersInText({
  dashcard,
  dashboard,
  parameterValues,
  text,
  escapeMarkdown = false,
  urlEncode = false,
}: FillParametersInTextProps): string {
  const parametersByTag = dashcard?.parameter_mappings?.reduce(
    (acc, mapping) => {
      // TODO: most likely we need to narrow down type of target for virtual
      // dashcards to ParameterTextTarget, then as string can be removed
      const tagId = mapping.target[1] as string;
      const parameter = dashboard.parameters?.find(
        (p) => p.id === mapping.parameter_id,
      );

      if (parameter) {
        // same as above, parameterValue type can be narrowed down when
        // ParameterTextTarget is used for virtual dashcards
        const rawParameterValue = parameterValues[parameter.id] as string;
        const parameterValue = urlEncode
          ? encodeURIComponent(rawParameterValue)
          : rawParameterValue;
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

  return text ?? "";
}
