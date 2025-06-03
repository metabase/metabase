import { getEngineNativeType } from "metabase/lib/engine";
import * as Lib from "metabase-lib";
import type {
  DatasetError,
  DatasetErrorType,
  FixSqlQueryRequest,
  SqlQueryFix,
} from "metabase-types/api";

export function getFixRequest(
  query: Lib.Query,
  queryError: DatasetError,
  queryErrorType: DatasetErrorType | undefined,
): FixSqlQueryRequest | undefined {
  if (typeof queryError !== "string" || queryErrorType !== "invalid-query") {
    return;
  }

  const queryInfo = Lib.queryDisplayInfo(query);
  if (!queryInfo.isNative) {
    return;
  }

  const engine = Lib.engine(query);
  const engineType = engine && getEngineNativeType(engine);
  if (engineType !== "sql") {
    return;
  }

  return {
    query: Lib.toLegacyQuery(query),
    error_message: queryError,
  };
}

export function getFixedQuery(query: Lib.Query, fixes: SqlQueryFix[]) {
  const sql = Lib.rawNativeQuery(query);
  const sqlLines = sql.split("\n");
  const newSqlLines = fixes.reduce((result, fix) => {
    const lineIndex = fix.line_number - 1;
    result[lineIndex] = fix.fixed_sql;
    return result;
  }, sqlLines);
  const newSql = newSqlLines.join("\n");
  return Lib.withNativeQuery(query, newSql);
}

export function getFixedLineNumbers(fixes: SqlQueryFix[]) {
  return fixes.map((fix) => fix.line_number);
}
