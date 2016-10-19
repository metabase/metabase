/* @flow */

import type { DatabaseId } from "./Database";
import type { StructuredQueryObject, NativeQueryObject } from "./Query";
import type { ParameterInstance } from "./Dashboard";

export type CardId = number;

export type VisualizationSettings = { [key: string]: any }

export type CardObject = {
    id: CardId,
    dataset_query: DatasetQueryObject,
    display: string,
    visualization_settings: VisualizationSettings
};

export type StructuredDatasetQueryObject = {
    type: "query",
    database: ?DatabaseId,
    query: StructuredQueryObject,
    parameters?: Array<ParameterInstance>
};

export type NativeDatasetQueryObject = {
    type: "native",
    database: ?DatabaseId,
    native: NativeQueryObject,
    parameters?: Array<ParameterInstance>
};

export type DatasetQueryObject = StructuredDatasetQueryObject | NativeDatasetQueryObject;
