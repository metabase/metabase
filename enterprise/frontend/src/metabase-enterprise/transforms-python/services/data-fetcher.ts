import { MetabaseApi } from "metabase/services";
import type { DatasetColumn } from "metabase-types/api/dataset";

import type { PyodideTableSource } from "./pyodide-worker-manager";

export interface FetchDataOptions {
  databaseId: number;
  tableName: string;
  schemaName?: string;
  limit?: number;
}

export class DataFetcher {
  static async fetchTableData(
    options: FetchDataOptions,
  ): Promise<PyodideTableSource> {
    const { databaseId, tableName, schemaName, limit = 1 } = options;

    try {
      // Create a native query to fetch limited data
      const sqlQuery = schemaName
        ? `SELECT * FROM ${schemaName}.${tableName} LIMIT ${limit}`
        : `SELECT * FROM ${tableName} LIMIT ${limit}`;

      // Execute the query using MetabaseApi.dataset for ad-hoc queries
      const response = await MetabaseApi.dataset({
        type: "native",
        native: {
          query: sqlQuery,
        },
        database: databaseId,
      });

      return this.convertToTransformSource(tableName, response);
    } catch (error) {
      console.error(`Failed to fetch data for table ${tableName}:`, error);

      // Return empty source on error
      return {
        database_id: databaseId,
        table_name: tableName,
        schema_name: schemaName,
        variable_name: this.sanitizeVariableName(tableName),
        columns: [],
        rows: [],
      };
    }
  }

  private static convertToTransformSource(
    tableName: string,
    dataset: any,
  ): PyodideTableSource {
    // The response structure is { data: DatasetData }
    const data = dataset.data || dataset;

    const columns = data.cols.map((col: DatasetColumn) => ({
      name: col.name,
      type: this.mapMetabaseTypeToPython(
        col.base_type || col.semantic_type || "type/*",
      ),
    }));

    const rows = data.rows.slice(0, 1).map((row: any[]) => {
      const obj: Record<string, any> = {};
      data.cols.forEach((col: DatasetColumn, index: number) => {
        obj[col.name] = row[index];
      });
      return obj;
    });

    return {
      database_id: 0, // Will be set by caller
      table_name: tableName,
      variable_name: this.sanitizeVariableName(tableName),
      columns,
      rows,
    };
  }

  private static mapMetabaseTypeToPython(metabaseType: string): string {
    // Map Metabase types to Python/pandas types
    const typeMap: Record<string, string> = {
      "type/Text": "str",
      "type/Integer": "int",
      "type/BigInteger": "int",
      "type/Float": "float",
      "type/Decimal": "float",
      "type/Number": "float",
      "type/Boolean": "bool",
      "type/Date": "datetime",
      "type/DateTime": "datetime",
      "type/Time": "time",
      "type/JSON": "dict",
      "type/UUID": "str",
    };

    for (const [key, value] of Object.entries(typeMap)) {
      if (metabaseType.includes(key)) {
        return value;
      }
    }

    return "object"; // Default pandas type for unknown
  }

  private static sanitizeVariableName(name: string): string {
    // Convert table name to valid Python variable name
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^(\d)/, "_$1") // Prefix with _ if starts with digit
      .replace(/^_+/, "") // Remove leading underscores
      .replace(/_+/g, "_"); // Replace multiple underscores with single
  }

  static async fetchMultipleTablesData(
    sources: Array<{
      database_id: number;
      table_name: string;
      schema_name?: string;
      variable_name?: string;
    }>,
  ): Promise<PyodideTableSource[]> {
    const fetchPromises = sources.map((source) =>
      this.fetchTableData({
        databaseId: source.database_id,
        tableName: source.table_name,
        schemaName: source.schema_name,
        limit: 1,
      }).then((result) => ({
        ...result,
        variable_name: source.variable_name || result.variable_name,
      })),
    );

    return Promise.all(fetchPromises);
  }
}

export const dataFetcher = new DataFetcher();
