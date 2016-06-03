/* @flow */

import type Metadata from "./metadata/Metadata";
import type Table from "./metadata/Table";
import type { CardObject } from "./types/Card";
import type { ParameterOption, ParameterObject, ParameterMappingOption } from "./types/Dashboard";

import { slugify } from "metabase/lib/formatting";

import _ from "underscore";

const PARAMETER_OPTIONS: Array<ParameterOption> = [
    {
        id: "datetime/month-year",
        name: "Month and Year",
        description: "Like January, 2016",
        type: "datetime"
    },
    {
        id: "datetime/quarter-year",
        name: "Quarter and Year",
        description: "Like Q1, 2016",
        type: "datetime"
    },
    {
        id: "datetime/single",
        name: "Single Date",
        description: "Like January 31, 2016",
        type: "datetime"
    },
    {
        id: "datetime/range",
        name: "Date Range",
        description: "Like December 25, 2015 - February 14, 2016",
        type: "datetime"
    },
    {
        id: "datetime/relative",
        name: "Relative Date",
        description: "Like \"the last 7 days\" or \"this month\"",
        type: "datetime"
    },
    {
        id: "location/city",
        name: "City",
        type: "category"
    },
    {
        id: "location/state",
        name: "State",
        type: "category"
    },
    {
        id: "location/zip",
        name: "ZIP or Postal Code",
        type: "category"
    },
    {
        id: "location/country",
        name: "Country",
        type: "category"
    },
    {
        id: "id",
        name: "ID",
        type: "id"
    },
    {
        id: "category",
        name: "Category",
        type: "category"
    },
];

export const PARAMETER_SECTIONS = [
    { id: "datetime", name: "Time",             description: "Date range, relative date, time of day, etc." },
    { id: "location", name: "Location",         description: "City, State, Country, ZIP code." },
    { id: "id",       name: "ID",               description: "User ID, product ID, event ID, etc." },
    { id: "category", name: "Other Categories", description: "Category, Type, Model, Rating, etc." },
];

for (const option of PARAMETER_OPTIONS) {
    let sectionId = option.id.split("/")[0];
    let section = _.findWhere(PARAMETER_SECTIONS, { id: sectionId });
    if (!section) {
        section = _.findWhere(PARAMETER_SECTIONS, { id: "category" });
    }
    section.options = section.options || [];
    section.options.push(option);
}

export function getParameterMappingOptions(metadata: Metadata, parameter: ParameterObject, card: CardObject): Array<ParameterMappingOption> {
    if (card.dataset_query.type === "query") {
        const table = card.dataset_query.query.source_table != null ? metadata.table(card.dataset_query.query.source_table) : null;
        if (table) {
            return table.fields().map(field => {
                const target = ["dimension", ["field-id", field.id]];
                return {
                    name: field.display_name,
                    target: target
                };
            });
        }
    } else {
        return [];
    }
    return [];
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
       widget: option.id,
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
