import { DatabaseId } from "./Database";
import { StructuredQuery, NativeQuery } from "./Query";
import { Parameter, ParameterQueryObject } from "./Parameter";

export type CardId = number;

export type VisualizationSettings = {
  [key: string]: any;
};

export type UnsavedCard = {
  dataset_query: DatasetQuery;
  display: string;
  visualization_settings: VisualizationSettings;
  parameters?: Array<Parameter>;

  // Not part of the card API contract, a field used by query builder for showing lineage
  original_card_id?: CardId;
};

export type SavedCard = UnsavedCard & {
  id: CardId;
  name?: string;
  description?: string;
  dataset?: boolean;
  can_write: boolean;
  public_uuid: string;
};

export type Card = SavedCard | UnsavedCard;

export type StructuredDatasetQuery = {
  type: "query";
  database?: DatabaseId;
  query: StructuredQuery;
  parameters?: Array<ParameterQueryObject>;
};

export type NativeDatasetQuery = {
  type: "native";
  database?: DatabaseId;
  native: NativeQuery;
  parameters?: Array<ParameterQueryObject>;
};

/**
 * All possible formats for `dataset_query`
 */
export type DatasetQuery = StructuredDatasetQuery | NativeDatasetQuery;
