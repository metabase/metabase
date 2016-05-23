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
    database: ?DatabaseId
};

export type DatasetQueryObject = StructuredDatasetQueryObject | NativeDatasetQueryObject;
