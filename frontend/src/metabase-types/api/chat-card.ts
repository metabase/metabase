import type { DatabaseId } from "./database";
import type { Field } from "./field";
import type { Parameter } from "./parameters";
import type { DatasetQuery, PublicDatasetQuery } from "./query";
import type {
    CardFilterOption,
    VisualizationSettings,
  } from "./card";

export type ChatCardType = "model" | "question" | "metric";

export interface ChatCard<Q extends DatasetQuery = DatasetQuery>
    extends UnsavedChatCard<Q> {
    id: ChatCardId;
    description: string | null;
    display: string;
    dataset_query: Q;
    visualization_settings: VisualizationSettings;
    database_id?: DatabaseId;
    table_id?: number | null;
    query_type?: string | null;
    result_metadata: Field[];
    type: ChatCardType;
    original_card_id?: number;
    question_hash?: string | null;
}

export interface PublicChatCard {
    id: ChatCardId;
    description: string | null;
    display: string;
    visualization_settings: VisualizationSettings;
    parameters?: Parameter[];
    dataset_query: PublicDatasetQuery;
}

export interface UnsavedChatCard<Q extends DatasetQuery = DatasetQuery> {
    display: string;
    dataset_query: Q;
    parameters?: Parameter[];
    visualization_settings: VisualizationSettings;

    // Not part of the chat card API contract, a field used by query builder for showing lineage
    original_card_id?: number;
}

export type ChatCardId = number;

export interface ListChatCardsRequest {
    f?: CardFilterOption;
    model_id?: ChatCardId;
}

export interface GetChatCardRequest {
    id: ChatCardId;
    ignore_view?: boolean;
    ignore_error?: boolean;
}

export interface CreateChatCardRequest {
    display: string;
    dataset_query: DatasetQuery;
    visualization_settings: VisualizationSettings;
    type?: ChatCardType;
    description?: string;
    result_metadata?: Field[];
}

export interface UpdateChatCardRequest {
    id: ChatCardId;
    display?: string;
    description?: string;
    visualization_settings?: VisualizationSettings;
    type?: ChatCardType;
    result_metadata?: Field[];
}
