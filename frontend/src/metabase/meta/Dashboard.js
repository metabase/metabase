/* @flow */

import type Metadata from "./metadata/Metadata";
import type Table from "./metadata/Table";
import type Field from "./metadata/Field";
import type { TemplateTag } from "./types/Query";
import type { CardObject } from "./types/Card";
import type { ParameterOption, ParameterObject, ParameterMappingOption, ParameterMappingTarget, DimensionTarget, VariableTarget } from "./types/Dashboard";

import { getTemplateTags } from "./Card";

import { slugify, stripId } from "metabase/lib/formatting";
import Query from "metabase/lib/query";
import { TYPE, isa } from "metabase/lib/types";

import _ from "underscore";

export const PARAMETER_OPTIONS: Array<ParameterOption> = [
    {
        type: "date/month-year",
        name: "Month and Year",
        description: "Like January, 2016"
    },
    {
        type: "date/quarter-year",
        name: "Quarter and Year",
        description: "Like Q1, 2016"
    },
    {
        type: "date/single",
        name: "Single Date",
        description: "Like January 31, 2016"
    },
    {
        type: "date/range",
        name: "Date Range",
        description: "Like December 25, 2015 - February 14, 2016"
    },
    {
        type: "date/relative",
        name: "Relative Date",
        description: "Like \"the last 7 days\" or \"this month\""
    },
    {
        type: "location/city",
        name: "City"
    },
    {
        type: "location/state",
        name: "State"
    },
    {
        type: "location/zip_code",
        name: "ZIP or Postal Code"
    },
    {
        type: "location/country",
        name: "Country"
    },
    {
        type: "id",
        name: "ID"
    },
    {
        type: "category",
        name: "Category"
    },
];

export const PARAMETER_SECTIONS = [
    { id: "date",     name: "Time",             description: "Date range, relative date, time of day, etc." },
    { id: "location", name: "Location",         description: "City, State, Country, ZIP code." },
    { id: "id",       name: "ID",               description: "User ID, product ID, event ID, etc." },
    { id: "category", name: "Other Categories", description: "Category, Type, Model, Rating, etc." },
];

for (const option of PARAMETER_OPTIONS) {
    let sectionId = option.type.split("/")[0];
    let section = _.findWhere(PARAMETER_SECTIONS, { id: sectionId });
    if (!section) {
        section = _.findWhere(PARAMETER_SECTIONS, { id: "category" });
    }
    section.options = section.options || [];
    section.options.push(option);
}

type Dimension = {
    name: string,
    parentName: string,
    target: DimensionTarget,
    field_id: number,
    depth: number
};

type Variable = {
    name: string,
    target: VariableTarget,
    type: string
};

type FieldFilter = (field: Field) => boolean;
type TemplateTagFilter = (tag: TemplateTag) => boolean;

export function getFieldDimension(field: Field): Dimension {
    return {
        name: field.display_name,
        field_id: field.id,
        parentName: field.table().display_name,
        target: ["field-id", field.id],
        depth: 0
    };
}

export function getTagDimension(tag: TemplateTag, dimension: Dimension): Dimension {
    return {
        name: dimension.name,
        parentName: dimension.parentName,
        target: ["template-tag", tag.name],
        field_id: dimension.field_id,
        depth: 0
    }
}

export function getCardDimensions(metadata: Metadata, card: CardObject, filter: FieldFilter = () => true): Array<Dimension> {
    if (card.dataset_query.type === "query") {
        const table = card.dataset_query.query.source_table != null ? metadata.table(card.dataset_query.query.source_table) : null;
        if (table) {
            return getTableDimensions(table, 1, filter);
        }
    } else if (card.dataset_query.type === "native") {
        let dimensions = [];
        for (const tag of getTemplateTags(card)) {
            if (tag.type === "dimension" && Array.isArray(tag.dimension) && tag.dimension[0] === "field-id") {
                const field = metadata.field(tag.dimension[1]);
                if (field && filter(field)) {
                    let fieldDimension = getFieldDimension(field);
                    dimensions.push(getTagDimension(tag, fieldDimension));
                }
            }
        }
        return dimensions;
    }
    return [];
}

export function getTableDimensions(table: Table, depth: number, filter: FieldFilter = () => true): Array<Dimension> {
    return _.chain(table.fields())
        .map(field => {
            let targetField = field.target();
            if (targetField && depth > 0) {
                let targetTable = targetField.table();
                return _.map(getTableDimensions(targetTable, depth - 1, filter), (dimension) => ({
                    ...dimension,
                    parentName: stripId(field.display_name),
                    target: ["fk->", field.id, dimension.target[0] === "field-id" ? dimension.target[1] : dimension.target],
                    depth: dimension.depth + 1
                }));
            } else if (filter(field)) {
                return [getFieldDimension(field)];
            }
        })
        .flatten()
        .filter(dimension => dimension != null)
        .value();
}

export function getCardVariables(metadata: Metadata, card: CardObject, filter: TemplateTagFilter = () => true): Array<Variable> {
    if (card.dataset_query.type === "native") {
        let variables = [];
        for (const tag of getTemplateTags(card)) {
            if (!filter || filter(tag)) {
                variables.push({
                    name: tag.display_name || tag.name,
                    type: tag.type,
                    target: ["template-tag", tag.name]
                });
            }
        }
        return variables;
    }
    return [];
}

export function getParameterMappingTargetField(metadata: Metadata, card: CardObject, target: ParameterMappingTarget): ?Field {
    if (target[0] === "dimension") {
        let dimension = target[1];
        if (Array.isArray(dimension) && dimension[0] === "template-tag") {
            if (card.dataset_query.type === "native") {
                let templateTag = card.dataset_query.native.template_tags[String(dimension[1])];
                if (templateTag && templateTag.type === "dimension") {
                    return metadata.field(Query.getFieldTargetId(templateTag.dimension));
                }
            }
        } else {
            return metadata.field(Query.getFieldTargetId(dimension));
        }
    }
    return null;
}

function fieldFilterForParameter(parameter: ParameterObject): FieldFilter {
    const [type] = parameter.type.split("/");
    switch (type) {
        case "date":        return (field: Field) => field.isDate();
        case "id":          return (field: Field) => field.isID();
        case "category":    return (field: Field) => field.isCategory();
    }
    switch (parameter.type) {
        case "location/city":     return (field: Field) => isa(field.special_type, TYPE.City);
        case "location/state":    return (field: Field) => isa(field.special_type, TYPE.State);
        case "location/zip_code": return (field: Field) => isa(field.special_type, TYPE.ZipCode);
        case "location/country":  return (field: Field) => isa(field.special_type, TYPE.Country);
    }
    return (field: Field) => false;
}

function tagFilterForParameter(parameter: ParameterObject): TemplateTagFilter {
    const [type, subtype] = parameter.type.split("/");
    switch (type) {
        case "date":        return (tag: TemplateTag) => subtype === "single" && tag.type === "date";
        case "location":    return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
        case "id":          return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
        case "category":    return (tag: TemplateTag) => tag.type === "number" || tag.type === "text";
    }
    return (tag: TemplateTag) => false;
}

const VARIABLE_ICONS = {
    "text": "string",
    "number": "int",
    "date": "calendar"
};

export function getParameterMappingOptions(metadata: Metadata, parameter: ParameterObject, card: CardObject): Array<ParameterMappingOption> {
    let options = [];

    // dimensions
    options.push(
        ...getCardDimensions(metadata, card, fieldFilterForParameter(parameter))
            .map((dimension: Dimension) => {
                const field = metadata.field(dimension.field_id);
                return {
                    name: dimension.name,
                    target: ["dimension", dimension.target],
                    icon: field && field.icon(),
                    sectionName: dimension.parentName,
                    isFk: dimension.depth > 0
                };
            })
    );

    // variables
    options.push(
        ...getCardVariables(metadata, card, tagFilterForParameter(parameter))
            .map((variable: Variable) => ({
                name: variable.name,
                target: ["variable", variable.target],
                icon: VARIABLE_ICONS[variable.type],
                sectionName: "Variables",
                isVariable: true
            }))
    );

    return options;
}

export function createParameter(option: ParameterOption, parameters: Array<ParameterOption> = []): ParameterObject {
    let name = option.name;
    let nameIndex = 0;
    // get a unique name
    while (_.any(parameters, (p) => p.name === name)) {
        name = option.name + " " + (++nameIndex);
    }
    let parameter = {
       name: "",
       id: Math.floor(Math.random()*Math.pow(2,32)).toString(16),
       type: option.type,
    };
    return setParameterName(parameter, name);
}

export function setParameterName(parameter: ParameterObject, name: string): ParameterObject {
    return {
        ...parameter,
        name: name,
        slug: slugify(name)
    };
}

export function setParameterDefaultValue(parameter: ParameterObject, value: string): ParameterObject {
    return {
        ...parameter,
        default: value
    };
}
