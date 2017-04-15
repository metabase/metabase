/* @flow */

import type { DatasetQuery } from "./types/Card";
import type { TemplateTag } from "./types/Query";
import type { Parameter, ParameterTarget, ParameterValues } from "./types/Parameter";
import type { FieldId } from "./types/Field";

import Q from "metabase/lib/query";
import { mbqlEq } from "metabase/lib/query/util";

// NOTE: this should mirror `template-tag-parameters` in src/metabase/api/embed.clj
export function getTemplateTagParameters(tags: TemplateTag[]): Parameter[] {
    return tags.filter(tag => tag.type != null && (tag.widget_type || tag.type !== "dimension"))
        .map(tag => ({
            id: tag.id,
            type: tag.widget_type || (tag.type === "date" ? "date/single" : "category"),
            target: tag.type === "dimension" ?
                ["dimension", ["template-tag", tag.name]]:
                ["variable", ["template-tag", tag.name]],
            name: tag.display_name,
            slug: tag.name,
            default: tag.default
        }))
}

export const getParametersBySlug = (parameters: Parameter[], parameterValues: ParameterValues): {[key:string]: string} => {
    let result = {};
    for (const parameter of parameters) {
        if (parameterValues[parameter.id] != undefined) {
            result[parameter.slug] = parameterValues[parameter.id];
        }
    }
    return result;
}

/** Returns the field ID that this parameter target points to, or null if it's not a dimension target. */
export function getParameterTargetFieldId(target: ?ParameterTarget, datasetQuery: DatasetQuery): ?FieldId {
    if (target && target[0] === "dimension") {
        let dimension = target[1];
        if (Array.isArray(dimension) && mbqlEq(dimension[0], "template-tag")) {
            if (datasetQuery.type === "native") {
                let templateTag = datasetQuery.native.template_tags[String(dimension[1])];
                if (templateTag && templateTag.type === "dimension") {
                    return Q.getFieldTargetId(templateTag.dimension);
                }
            }
        } else {
            return Q.getFieldTargetId(dimension);
        }
    }
    return null;
}
