import cx from "classnames";
import { inflect } from "inflection";
import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { Loader, Stack, Text, rem } from "metabase/ui";
import { isNumeric, isPK } from "metabase-lib/v1/types/utils/isa";
import type { ForeignKey, Table } from "metabase-types/api";

import S from "./Relationship.module.css";

interface Props {
  fk: ForeignKey;
  href: string | undefined;
  rowId: string | number;
  table: Table;
  onClick?: () => void;
}

export const Relationship = ({ fk, href, rowId, table, onClick }: Props) => {
  const pk = (table.fields ?? []).find(isPK);
  const fkOriginId =
    fk.origin && typeof fk.origin.id == "number" ? fk.origin.id : undefined;

  const {
    data: dataset,
    error,
    isFetching,
  } = useGetAdhocQueryQuery(
    fk.origin != null && fkOriginId != null
      ? {
          type: "query",
          query: {
            "source-table": fk.origin?.table_id,
            filter: [
              "=",
              ["field", fkOriginId, null],
              isNumeric(pk) && typeof rowId === "string"
                ? parseFloat(rowId)
                : rowId,
            ],
            aggregation: [["count"]],
          },
          database: fk.origin.table?.db_id ?? table.db_id,
        }
      : skipToken,
  );

  const count = useMemo(() => {
    if (!dataset) {
      return undefined;
    }

    return dataset.data.rows[0]?.[0] ?? 0; // rows array can be empty (metabase#62156)
  }, [dataset]);
  const clickable = typeof count === "number" && count > 0;
  const originTableName = fk.origin?.table?.display_name ?? "";
  const relationName =
    typeof count === "number"
      ? inflect(originTableName, count)
      : originTableName;

  return (
    <Stack
      className={cx({
        [S.clickable]: clickable,
      })}
      gap={rem(12)}
      {...(clickable ? { component: Link, to: href, onClick } : undefined)}
    >
      {isFetching && <Loader data-testid="loading-indicator" size="md" />}

      {!isFetching && (
        <Text
          c={count === 0 ? "text-light" : "text-medium"}
          className={S.text}
          fw="bold"
          fz={rem(24)}
          lh={1}
        >
          {error ? t`Unknown` : String(count)}
        </Text>
      )}

      <Text
        c={count === 0 ? "text-light" : "text-medium"}
        className={S.text}
        fw="bold"
        lh={1}
      >
        {relationName}
      </Text>
    </Stack>
  );
};
