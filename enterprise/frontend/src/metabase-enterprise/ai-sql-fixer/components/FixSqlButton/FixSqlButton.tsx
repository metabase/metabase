import { P, match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { getEngineNativeType } from "metabase/lib/engine";
import { Button } from "metabase/ui";
import { useGetFixedSqlQuery } from "metabase-enterprise/api";
import * as Lib from "metabase-lib";
import type {
  AiFixSqlRequest,
  AiSqlFix,
  DatasetError,
} from "metabase-types/api";

type MetabotFixSqlButtonProps = {
  query: Lib.Query;
  queryError: DatasetError;
  onChange: (newQuery: Lib.Query) => void;
};

export function FixSqlButton({
  query,
  queryError,
  onChange,
}: MetabotFixSqlButtonProps) {
  const request = getRequest(query, queryError);
  const { data, error, isFetching } = useGetFixedSqlQuery(request ?? skipToken);
  const isDisabled = error != null || isFetching;

  const handleClick = () => {
    if (data) {
      onChange(getFixedQuery(query, data.fixes));
    }
  };

  if (!request) {
    return null;
  }

  return (
    <Button loading={isFetching} disabled={isDisabled} onClick={handleClick}>
      {match({ data, error, isFetching })
        .with({ isFetching: true }, () => null)
        .with({ error: P.nullish }, () => t`Have Metabot fix it`)
        .otherwise(() => t`Metabot can't fix it`)}
    </Button>
  );
}

function getRequest(
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

function getFixedQuery(query: Lib.Query, fixes: AiSqlFix[]) {
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
