import { createMockMetadata } from "__support__/metadata";
import {
  isAvatarURL,
  isEmail,
  isEntityName,
  isImageURL,
} from "metabase-lib/v1/types/utils/isa";
import * as ML_Urls from "metabase-lib/v1/urls";
import type {
  DatasetColumn,
  RowValue,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";

export function getExploreTableUrl(table: Table): string {
  const metadata = createMockMetadata({
    tables: table ? [table] : [],
  });
  const metadataTable = metadata?.table(table.id);
  const question = metadataTable?.newQuestion();

  if (!question) {
    throw new Error("Unable to create question");
  }

  return ML_Urls.getUrl(question);
}

export function renderValue(value: RowValue, column: DatasetColumn): string {
  if (value === undefined) {
    return "";
  }

  return String(value);
}

export function detectNameColumn(columns: DatasetColumn[]): number {
  let nameColumnIndex = columns.findIndex((column) => isEntityName(column));

  if (nameColumnIndex === -1) {
    nameColumnIndex = columns.findIndex(
      (column) => column.semantic_type === "type/Title",
    );
  }

  if (nameColumnIndex === -1) {
    nameColumnIndex = columns.findIndex((column) => isEmail(column));
  }

  return nameColumnIndex;
}

export function detectDescriptionColumn(columns: DatasetColumn[]) {
  let descriptionColumnIndex = columns.findIndex(
    (column) => column.semantic_type === "type/Description",
  );

  if (descriptionColumnIndex === -1) {
    descriptionColumnIndex = columns.findIndex((column) => isEmail(column));
  }

  return descriptionColumnIndex;
}

export function detectImageColumn(columns: DatasetColumn[]) {
  let imageColumnIndex = columns.findIndex((column) => isAvatarURL(column));

  if (imageColumnIndex === -1) {
    imageColumnIndex = columns.findIndex((column) => isImageURL(column));
  }

  return imageColumnIndex;
}

export function getRowCountQuery(
  table: Table,
): StructuredDatasetQuery | undefined {
  return {
    database: table.db_id,
    query: {
      "source-table": table.id,
      aggregation: [["count"]],
    },
    type: "query",
  };
}

export function getTableQuery(
  table: Table,
): StructuredDatasetQuery | undefined {
  return {
    database: table.db_id,
    query: {
      "source-table": table.id,
    },
    type: "query",
  };
}
