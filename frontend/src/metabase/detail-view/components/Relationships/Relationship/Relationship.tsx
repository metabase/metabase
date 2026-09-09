import cx from "classnames";
import { inflect } from "inflection";
import { useMemo } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { useMetadataProvider } from "metabase/metadata-store";
import { Loader, Stack, Text, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { ForeignKey } from "metabase-types/api";

import S from "./Relationship.module.css";
import {
  getForeignKeyCountQuery,
  getForeignKeyQuery,
  getForeignKeyQuestionUrl,
} from "./utils";

interface Props {
  fk: ForeignKey;
  rowId: string | number;
  onClick?: () => void;
}

export const Relationship = ({ fk, rowId, onClick }: Props) => {
  const metadataProvider = useMetadataProvider(fk.origin?.table?.db_id ?? null);
  // held in a ref on purpose: the query is not rebuilt when metadata changes
  const metadataProviderRef = useLatest(metadataProvider);
  const fkQuery = useMemo(
    () => getForeignKeyQuery(fk, rowId, metadataProviderRef.current),
    [fk, rowId, metadataProviderRef],
  );
  const fkCountQuery = useMemo(
    () => (fkQuery != null ? getForeignKeyCountQuery(fkQuery) : undefined),
    [fkQuery],
  );
  const fkQuestionUrl = useMemo(
    () => (fkQuery != null ? getForeignKeyQuestionUrl(fkQuery) : undefined),
    [fkQuery],
  );

  const {
    data: dataset,
    error,
    isFetching,
  } = useGetAdhocQueryQuery(
    fkCountQuery != null ? Lib.toJsQuery(fkCountQuery) : skipToken,
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
      {...(clickable
        ? { component: Link, to: fkQuestionUrl, onClick }
        : undefined)}
    >
      {isFetching && <Loader size="md" />}

      {!isFetching && (
        <Text
          c={count === 0 ? "text-disabled" : "text-secondary"}
          className={S.text}
          fw="bold"
          fz={rem(24)}
          lh={1}
        >
          {error ? t`Unknown` : String(count)}
        </Text>
      )}

      <Text
        c={count === 0 ? "text-disabled" : "text-secondary"}
        className={S.text}
        fw="bold"
        lh={1}
      >
        {relationName}
      </Text>
    </Stack>
  );
};
