import { getEngineNativeType } from "metabase/lib/engine";
import * as Lib from "metabase-lib";
import type {
  AiFixSqlRequest,
  AiSqlFix,
  DatasetError,
} from "metabase-types/api";

export function getFixRequest(
  query: Lib.Query,
  queryError: DatasetError,
): AiFixSqlRequest | undefined {
  if (typeof queryError !== "string") {
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

export function getFixedQuery(query: Lib.Query, fixes: AiSqlFix[]) {
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
