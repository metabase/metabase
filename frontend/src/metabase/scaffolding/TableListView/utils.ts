import {
  isAvatarURL,
  isEmail,
  isEntityName,
  isImageURL,
} from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  RowValue,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";

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
