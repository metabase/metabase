/* @flow */

import type Metadata from "./metadata/Metadata";
import type Table from "./metadata/Table";
import type { CardObject } from "./types/Card";
import type { ParameterOption, ParameterObject, ParameterMappingOption } from "./types/Dashboard";

import { slugify, stripId } from "metabase/lib/formatting";

import _ from "underscore";

const PARAMETER_OPTIONS: Array<ParameterOption> = [
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

export function getDimensions(table: Table, depth: number, filter = () => true) {
    return _.chain(table.fields())
        .map(field => {
            let targetField = field.target();
            if (targetField && depth > 0) {
                let targetTable = targetField.table();
                return _.map(getDimensions(targetTable, depth - 1, filter), (dimension) => ({
                    ...dimension,
                    sectionName: stripId(field.display_name),
                    target: ["fk->", targetField.id, dimension.target[0] === "field-id" ? dimension.target[1] : dimension.target],
                    depth: dimension.depth + 1
                }));
            } else if (filter(field)) {
                return [{
                    name: field.display_name,
                    field_id: field.id,
                    sectionName: table.display_name,
                    target: ["field-id", field.id],
                    depth: 0
                }];
            }
        })
        .flatten()
        .filter(dimension => dimension != null)
        .value();
}

const PARAMETER_ICONS = {
    "string": "string",
    "number": "int",
    "date": "calendar"
};

function fieldFilterForParameter(parameter: ParameterObject) {
    const [type, subtype] = parameter.type.split("/");
    switch (type) {
        case "date":        return (field) => field.isDate();
        case "location":    return (field) => field.special_type === subtype;
        case "id":          return (field) => field.special_type === "id";
        case "category":    return (field) => field.special_type === "category";
    }
    return (field) => false;
}

export function getParameterMappingOptions(metadata: Metadata, parameter: ParameterObject, card: CardObject): Array<ParameterMappingOption> {
    let options = [];
    if (card.dataset_query.type === "query") {
        const table = card.dataset_query.query.source_table != null ? metadata.table(card.dataset_query.query.source_table) : null;
        if (table) {
            options.push(...getDimensions(table, 1, fieldFilterForParameter(parameter))
            .map(dimension => ({
                name: dimension.name,
                target: ["dimension", dimension.target],
                icon: metadata.field(dimension.field_id).icon(),
                sectionName: dimension.sectionName
            })));
        }
    }

    if (card.parameters) {
        options.push(...card.parameters.map(parameter => ({
            name: parameter.name,
            target: ["parameter", parameter.name],
            icon: PARAMETER_ICONS[parameter.type],
            sectionName: ""
        })));
    }
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
