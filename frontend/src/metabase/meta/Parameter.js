import MetabaseSettings from "metabase/lib/settings";
import type { TemplateTag } from "metabase-types/types/Query";
import type { Parameter } from "metabase-types/types/Parameter";
import Dimension from "metabase-lib/lib/Dimension";
import _ from "underscore";
import { getParameterType } from "metabase/parameters/utils/parameter-type";

const areFieldFilterOperatorsEnabled = () =>
  MetabaseSettings.get("field-filter-operators-enabled?");

// NOTE: this should mirror `template-tag-parameters` in src/metabase/api/embed.clj
export function getTemplateTagParameters(tags: TemplateTag[]): Parameter[] {
  function getTemplateTagType(tag) {
    const { type } = tag;
    if (type === "date") {
      return "date/single";
    } else if (areFieldFilterOperatorsEnabled() && type === "string") {
      return "string/=";
    } else if (areFieldFilterOperatorsEnabled() && type === "number") {
      return "number/=";
    } else {
      return "category";
    }
  }

  return tags
    .filter(
      tag =>
        tag.type != null && (tag["widget-type"] || tag.type !== "dimension"),
    )
    .map(tag => {
      return {
        id: tag.id,
        type: tag["widget-type"] || getTemplateTagType(tag),
        target:
          tag.type === "dimension"
            ? ["dimension", ["template-tag", tag.name]]
            : ["variable", ["template-tag", tag.name]],
        name: tag["display-name"],
        slug: tag.name,
        default: tag.default,
      };
    });
}

export function getParameterIconName(parameter: ?Parameter) {
  const type = getParameterType(parameter);
  switch (type) {
    case "date":
      return "calendar";
    case "location":
      return "location";
    case "category":
      return "string";
    case "number":
      return "number";
    case "id":
    default:
      return "label";
  }
}

export function buildHiddenParametersSlugSet(hiddenParameterSlugs) {
  return _.isString(hiddenParameterSlugs)
    ? new Set(hiddenParameterSlugs.split(","))
    : new Set();
}

export function getVisibleParameters(parameters, hiddenParameterSlugs) {
  const hiddenParametersSlugSet = buildHiddenParametersSlugSet(
    hiddenParameterSlugs,
  );

  return parameters.filter(p => !hiddenParametersSlugSet.has(p.slug));
}
