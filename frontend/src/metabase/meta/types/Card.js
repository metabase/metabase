/* @flow */

import type { DatabaseId } from "./Database";
import type { StructuredQuery, NativeQuery } from "./Query";
import type { Parameter, ParameterInstance } from "./Parameter";
import { BreakoutClause, FilterClause } from "metabase/meta/types/Query";

export type CardId = number;

export type VisualizationSettings = {
    [key: string]: any
}

export type UnsavedCard = {
    dataset_query: DatasetQuery,
    display: string,
    visualization_settings: VisualizationSettings,
    parameters?: Array<Parameter>,
    original_card_id?: CardId
}

export type Card = {
    id: CardId,
    name: ?string,
    description: ?string,
    dataset_query: DatasetQuery,
    display: string,
    visualization_settings: VisualizationSettings,
    parameters?: Array<Parameter>,
    can_write: boolean,
    public_uuid: string
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

/**
 * The type for MultiDatasetQuery children
 */
export type ChildDatasetQuery = StructuredDatasetQuery | NativeDatasetQuery;

/**
 * A compound type for supporting multi-query questions without having to change the data model of Card
 */
export type MultiDatasetQuery = {
    type: "multi",
    queries: ChildDatasetQuery[],
    parameters?: Array<ParameterInstance>,
    // How the global/shared breakout(s) and filter(s) could be contained in MultiDatasetQuery:
    // sharedBreakout?: BreakoutClause,
    // sharedFilter?: FilterClause,
};

/**
 * All possible formats for `dataset_query`
 */
export type DatasetQuery = StructuredDatasetQuery | NativeDatasetQuery | MultiDatasetQuery;
