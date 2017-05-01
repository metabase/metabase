/* @flow */

import type { DatasetQuery } from "./types/Card";
import type { TemplateTag, LocalFieldReference } from "./types/Query";
import type { Parameter, ParameterTarget, ParameterValues } from "./types/Parameter";
import type { FieldId } from "./types/Field";

import Q from "metabase/lib/query";
import { mbqlEq } from "metabase/lib/query/util";

// $FlowFixMe
type RegexMatches = [string];
type Deserializer = (RegexMatches) => FieldFilter;

// Use a placeholder value as field references are not used in dashboard filters
// $FlowFixMe
const noopRef: LocalFieldReference = null;


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


const timeParameterValueDeserializers: [{ testRegex: RegExp, deserialize: Deserializer}] = [
    {testRegex: /^past([0-9]+)([a-z]+)s$/, deserialize: (matches) => {
        return ["time-interval", noopRef, -parseInt(matches[0]), matches[1]]
    }},
    {testRegex: /^next([0-9]+)([a-z]+)s$/, deserialize: (matches) => {
        return ["time-interval", noopRef, parseInt(matches[0]), matches[1]]
    }},
    {testRegex: /^this([a-z]+)$/, deserialize: (matches) => ["time-interval", noopRef, "current", matches[0]] },
    {testRegex: /^~([0-9-T:]+)$/, deserialize: (matches) => ["<", noopRef, matches[0]]},
    {testRegex: /^([0-9-T:]+)~$/, deserialize: (matches) => [">", noopRef, matches[0]]},
    {testRegex: /^([0-9-T:]+)$/, deserialize: (matches) => ["=", noopRef, matches[0]]},
    // TODO 3/27/17 Atte Keinänen
    // Unify BETWEEN -> between, IS_NULL -> is-null, NOT_NULL -> not-null throughout the codebase
    // $FlowFixMe
    {testRegex: /^([0-9-T:]+)~([0-9-T:]+)$/, deserialize: (matches) => ["BETWEEN", noopRef, matches[0], matches[1]]},
];

export function timeParameterValueToMBQL(urlEncoded: UrlEncoded): ?FieldFilter {
    const deserializer =
        timeParameterValueDeserializers.find((des) => urlEncoded.search(des.testRegex) !== -1);

    if (deserializer) {
        const substringMatches = deserializer.testRegex.exec(urlEncoded).splice(1);
        return deserializer.deserialize(substringMatches);
    } else {
        return null;
    }
}

export function parameterToMBQLFilter(parameter) {
    let field: ConcreteField;
    if (parameter.target && parameter.target[0] === "dimension" && parameter.target[1][0] !== "template-tag") {
        field = parameter.target[1][1];
    }

    if (!field) {
        return;
    }

    let filter;
    if (parameter.type.indexOf("date/") === 0) {
        filter = timeParameterValueToMBQL(parameter.value);
        filter[1] = field;
    } else {
        // FIXME: we don't have the field type so we don't know when the value should be a number or a string
        // assuming string for now
        filter = ["=", field, parameter.value];
    }

    return filter;
}
