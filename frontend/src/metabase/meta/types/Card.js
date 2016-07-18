/* @flow */

import type { DatabaseId } from "./base";
import type { StructuredQueryObject, NativeQueryObject } from "./Query";

export type CardId = number;

export type CardObject = {
    id: CardId,
    dataset_query: DatasetQueryObject
};

export type StructuredDatasetQueryObject = {
    type: "query",
    query: StructuredQueryObject,
    database: ?DatabaseId
};

export type NativeDatasetQueryObject = {
    type: "native",
    native: NativeQueryObject,
    database: ?DatabaseId,
    template_tags: { [key: string]: TemplateTag }
};

export type TemplateTag = {
    name: string,
    display_name: string,
    type: string,
    dimension?: ["field-id", number]
};

export type DatasetQueryObject = StructuredDatasetQueryObject | NativeDatasetQueryObject;
