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
    database: ?DatabaseId,
    query: StructuredQueryObject
};

export type NativeDatasetQueryObject = {
    type: "native",
    database: ?DatabaseId,
    native: NativeQueryObject,
};

export type DatasetQueryObject = StructuredDatasetQueryObject | NativeDatasetQueryObject;
