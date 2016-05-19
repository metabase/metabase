/* @flow */

import type { DatabaseId } from "./base";
import type { StructuredQueryObject, NativeQueryObject } from "./Query";

export type CardObject = {
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
    database: ?DatabaseId
};

export type DatasetQueryObject = StructuredDatasetQueryObject | NativeDatasetQueryObject;
