/* @flow */

import type { DatabaseId } from "./Database";
import type { StructuredQuery, NativeQuery } from "./Query";
import type { ParameterInstance } from "./Dashboard";

export type CardId = number;

export type Card = {
    id: CardId,
    name: ?string,
    dataset_query: DatasetQuery,
    display: string,
    visualization_settings: VisualizationSettings
};

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
