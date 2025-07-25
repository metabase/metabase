import { createMockMetadata } from "__support__/metadata";
import * as Urls from "metabase/lib/urls";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  isAvatarURL,
  isEmail,
  isEntityName,
  isImageURL,
} from "metabase-lib/v1/types/utils/isa";
import * as ML_Urls from "metabase-lib/v1/urls";
import type {
  ComponentSettings,
  DatasetColumn,
  ListViewSettings,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";

import type { ParsedRouteParams, RouteParams } from "./types";

export function parseRouteParams(
  location: Location,
  params: RouteParams,
): ParsedRouteParams {
  const searchParams = new URLSearchParams(location.search);
  const page = searchParams.get("page");

  return {
    tableId: Urls.extractEntityId(params.tableId)!,
    page: page ? parseInt(page, 10) : 0,
  };
}

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

export function detectNameColumn(columns: DatasetColumn[]) {
  return (
    columns.find((column) => isEntityName(column)) ||
    columns.find((column) => column.semantic_type === "type/Title") ||
    columns.find((column) => isEmail(column))
  );
}

export function detectDescriptionColumn(columns: DatasetColumn[]) {
  return (
    columns.find((column) => column.semantic_type === "type/Description") ||
    columns.find((column) => isEmail(column))
  );
}

export function detectImageColumn(columns: DatasetColumn[]) {
  return (
    columns.find((column) => isAvatarURL(column)) ||
    columns.find((column) => isImageURL(column))
  );
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

export function getDefaultComponentSettings(
  table: Table | undefined,
): ComponentSettings {
  return {
    list_view: getDefaultListViewSettings(table),
    object_view: {},
  };
}

export function getDefaultListViewSettings(
  table: Table | undefined,
): ListViewSettings {
  const fields = table?.fields ?? [];

  return {
    row_height: "normal",
    // TODO: do we need to filter out fields based on visibility_type?
    fields: fields.map((field) => ({
      field_id: getRawTableFieldId(field),
      style: "normal",
    })),
  };
}
