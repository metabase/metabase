/* @flow */

import type { TemplateTag } from "./types/Query";
import type { Parameter, ParameterId } from "./types/Dashboard";

export type ParameterValues = {
    [id: ParameterId]: string
};

export function getTemplateTagParameters(tags: TemplateTag[]): Parameter[] {
    return tags.filter(tag => tag.type != null && tag.type !== "dimension")
        .map(tag => ({
            id: tag.id,
            type: tag.type === "date" ? "date/single" : "category",
            target: ["variable", ["template-tag", tag.name]],
            name: tag.display_name,
            slug: tag.name,
            default: tag.default
        }))
}

export const getParametersBySlug = (parameters: Parameter[], parameterValues: ParameterValues): {[key:string]: string} => {
    let result = {};
    for (const parameter of parameters) {
        if (parameterValues[parameter.id] !== undefined) {
            result[parameter.slug] = parameterValues[parameter.id];
        }
    }
    return result;
}
