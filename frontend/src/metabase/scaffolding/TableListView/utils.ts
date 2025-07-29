import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import * as Urls from "metabase/lib/urls";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  isAvatarURL,
  isDate,
  isDateWithoutTime,
  isEmail,
  isEntityName,
  isImageURL,
  isPK,
} from "metabase-lib/v1/types/utils/isa";
import * as ML_Urls from "metabase-lib/v1/urls";
import type {
  ComponentSettings,
  DatasetColumn,
  Field,
  ListViewTableSettings,
  ObjectViewSettings,
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
    list_view: {
      view: "table",
      table:
        table?.component_settings?.list_view?.table ??
        getDefaultListViewTableSettings(table),
      list: getDefaultListViewListSettings(table),
      gallery: getDefaultListViewGallerySettings(table),
    },
    object_view: getDefaultObjectViewSettings(table),
  };
}

export function getDefaultListViewTableSettings(
  table: Table | undefined,
): ListViewTableSettings {
  const fields = table?.fields ?? [];

  return {
    row_height: "normal",
    // TODO: do we need to filter out fields based on visibility_type?
    fields: fields.map((field) => ({
      field_id: getRawTableFieldId(field),
      style: isEntityName(field) ? "bold" : "normal",
    })),
  };
}

export function getDefaultObjectViewSettings(
  table: Table | undefined,
): ObjectViewSettings {
  const fields = table?.fields ?? [];

  return {
    sections: [
      {
        id: getNextId(),
        title: "Info",
        direction: "vertical",
        fields: fields.map((field) => ({
          field_id: getRawTableFieldId(field),
          style: "normal",
        })),
      },
    ],
  };
}

export function getDefaultListViewGallerySettings(
  table: Table | undefined,
): ObjectViewSettings {
  const fields = table?.fields ?? [];
  const bestFields = getBestFields(fields);

  return {
    sections: [
      {
        id: getNextId(),
        title: "Info",
        direction: "vertical",
        fields: bestFields.map((field) => ({
          field_id: getRawTableFieldId(field),
          style: isEntityName(field) ? "bold" : "normal",
        })),
      },
    ],
  };
}

export function getDefaultListViewListSettings(
  table: Table | undefined,
): ObjectViewSettings {
  const fields = table?.fields ?? [];
  const bestFields = getBestFields(fields);

  return {
    sections: [
      {
        id: getNextId(),
        title: "Info",
        direction: "horizontal",
        fields: bestFields.map((field) => ({
          field_id: getRawTableFieldId(field),
          style: isEntityName(field) ? "bold" : "normal",
        })),
      },
    ],
  };
}

function getBestFields(fields: Field[]): Field[] {
  let bestFields: Field[] = [];

  bestFields.push(...fields.filter(isPK));
  bestFields.push(...fields.filter(isEntityName));
  bestFields.push(
    ...fields.filter((field) => field.semantic_type === "type/Title"),
  );
  bestFields.push(...fields.filter(isEmail));
  bestFields.push(
    ...fields.filter((field) => field.semantic_type === "type/Description"),
  );
  bestFields.push(...fields.filter(isAvatarURL));
  bestFields.push(...fields.filter(isImageURL));
  bestFields.push(...fields.filter(isDateWithoutTime));
  bestFields.push(...fields.filter(isDate));
  bestFields.push(...fields.filter((field) => field.semantic_type != null));

  bestFields = _.uniq(bestFields);

  const missingFieldsCount = 7 - bestFields.length;

  if (missingFieldsCount > 0) {
    const otherFields = fields.filter((field) => !bestFields.includes(field));
    bestFields.push(...otherFields.slice(0, missingFieldsCount));
  }

  return bestFields.slice(0, 7);
}
