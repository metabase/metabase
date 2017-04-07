/* @flow */

import type { DatasetQuery } from "./types/Card";
import type { TemplateTag } from "./types/Query";
import type { Parameter, ParameterId, ParameterTarget } from "./types/Dashboard";
import type { FieldId } from "./types/Field";

export type ParameterValues = {
    [id: ParameterId]: string
};

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

import { parameterOptionsForField, createParameter, setParameterName, setParameterDefaultValue } from "./Dashboard";
import Field from "metabase/meta/metadata/Field";
import Query from "metabase/lib/query";

export function getParameterForFilter(filter, parameters, tableMetadata): ?Parameter {
    let fieldTarget = Query.getFieldTarget(filter[1], tableMetadata);
    if (fieldTarget && fieldTarget.field) {
        const options = parameterOptionsForField(new Field(fieldTarget.field));
        console.log("options", options)
        if (options.length > 0) {
            let parameter = createParameter(options[0], parameters);
            parameter = setParameterName(parameter, fieldTarget.field.display_name);
            if (typeof filter[2] === "string" || typeof filter[2] === "number") {
                parameter = setParameterDefaultValue(parameter, filter[2]);
            }
            return {
                ...parameter,
                target: ["field-id", fieldTarget.field.id]
            }
        }
    }
}
