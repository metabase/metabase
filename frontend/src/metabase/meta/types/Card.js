/* @flow */

import type { DatabaseId } from "./Database";
import type { StructuredQuery, NativeQuery } from "./Query";
import type { Parameter, ParameterInstance } from "./Parameter";

export type CardId = number;

export type UnsavedCard = {
    dataset_query: DatasetQuery,
    display: string,
    visualization_settings: VisualizationSettings,
    parameters?: Array<Parameter>
}

export type SavedCardFields = {
    id: CardId,
    name: ?string,
    description: ?string,
}

export type Card = UnsavedCard & SavedCardFields;

export type StructuredDatasetQuery = {
    type: "query",
    database: ?DatabaseId,
    query: StructuredQuery,
    parameters?: Array<ParameterInstance>
};

export type NativeDatasetQuery = {
    type: "native",
    database: ?DatabaseId,
    native: NativeQuery,
    parameters?: Array<ParameterInstance>
};

export type VisualizationSettings = {
    [key: string]: any
}

export type DatasetQuery = StructuredDatasetQuery | NativeDatasetQuery;
