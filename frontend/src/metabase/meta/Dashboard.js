/* @flow */

import type { ParameterOption, ParameterObject } from "./types/Dashboard";

import { slugify } from "metabase/lib/formatting";

import _ from "underscore";

const PARAMETER_OPTIONS: Array<ParameterOption> = [
    {
        id: "datetime/range",
        name: "Date Picker",
        description: "Lets you pick specific or relative dates",
        type: "datetime"
    },
    {
        id: "datetime/month-year",
        name: "Month and Year",
        description: "Like January, 2016",
        type: "datetime"
    },
    {
        id: "datetime/quarter-year",
        name: "Month and Year",
        description: "Like Q1, 2016",
        type: "datetime"
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

export function createParameter(option: ParameterOption): ParameterObject {
    return {
       id: Math.floor(Math.random()*Math.pow(2,32)).toString(16),
       name: "",
       slug: "",
       widget: option.id,
       type: option.type,
   }
}

export function setParameterName(parameter: ParameterObject, name: string): ParameterObject {
    return {
        ...parameter,
        name: name,
        slug: slugify(name)
    };
}
