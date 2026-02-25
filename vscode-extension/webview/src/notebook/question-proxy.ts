import {
  fromJsQueryAndMetadata,
  Metadata,
} from "../../../vendor/notebook-component.esm.js";
import type {
  NotebookMetadata,
  NotebookMetadataDatabase,
  NotebookMetadataTable,
  NotebookMetadataField,
} from "../../../src/shared-types";

function buildDatabaseRecord(data: NotebookMetadataDatabase, metadata: any) {
  return {
    id: data.id,
    name: data.name,
    engine: data.engine,
    features: data.features,
    tables: [] as any[],
    metadata,
    hasFeature(feature: string) {
      return this.features.includes(feature);
    },
  };
}

function buildTableRecord(data: NotebookMetadataTable, metadata: any) {
  return {
    id: data.id,
    db_id: data.db_id,
    name: data.name,
    display_name: data.display_name,
    schema: data.schema,
    fields: [] as any[],
    db: null as any,
    metadata,
  };
}

function buildFieldRecord(data: NotebookMetadataField, metadata: any) {
  return {
    id: data.id,
    table_id: data.table_id,
    name: data.name,
    display_name: data.display_name,
    base_type: data.base_type,
    semantic_type: data.semantic_type,
    uniqueId: data.id,
    table: null as any,
    metadata,
  };
}

export function buildMetadata(notebookMetadata: NotebookMetadata) {
  const metadata = new Metadata();

  for (const [idStr, database] of Object.entries(notebookMetadata.databases)) {
    metadata.databases[Number(idStr)] = buildDatabaseRecord(database, metadata);
  }
  for (const [idStr, table] of Object.entries(notebookMetadata.tables)) {
    metadata.tables[Number(idStr)] = buildTableRecord(table, metadata);
  }
  for (const [idStr, field] of Object.entries(notebookMetadata.fields)) {
    metadata.fields[Number(idStr)] = buildFieldRecord(field, metadata);
  }

  for (const database of Object.values(metadata.databases) as any[]) {
    database.tables = Object.values(metadata.tables).filter(
      (table: any) => table.db_id === database.id,
    );
  }
  for (const table of Object.values(metadata.tables) as any[]) {
    table.fields = Object.values(metadata.fields).filter(
      (field: any) => field.table_id === table.id,
    );
    table.db = metadata.databases[table.db_id] ?? null;
  }
  for (const field of Object.values(metadata.fields) as any[]) {
    field.table = metadata.tables[field.table_id] ?? null;
  }

  return metadata;
}

export function buildQuestion(
  datasetQuery: Record<string, unknown>,
  metadata: InstanceType<typeof Metadata>,
  cardType: string | null,
) {
  const query = fromJsQueryAndMetadata(metadata as any, datasetQuery as any);

  const questionProxy = {
    _query: query,
    _metadata: metadata,
    _cardType: cardType ?? "question",

    query() {
      return this._query;
    },
    metadata() {
      return this._metadata;
    },
    type() {
      return this._cardType;
    },
    setQuery(newQuery: any) {
      return {
        ...questionProxy,
        _query: newQuery,
        query: () => newQuery,
        setQuery: questionProxy.setQuery,
      };
    },
    card() {
      return {
        dataset_query: datasetQuery,
        display: "table",
        visualization_settings: {},
      };
    },
    setCard() {
      return questionProxy;
    },
  };

  return questionProxy;
}
