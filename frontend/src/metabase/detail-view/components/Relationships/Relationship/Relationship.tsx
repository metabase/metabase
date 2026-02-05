import cx from "classnames";
import { inflect } from "inflection";
import { useMemo } from "react";
import { Link } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex, Icon, Loader, Stack, Text, rem } from "metabase/ui";
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
  const metadata = useSelector(getMetadata);
  const metadataRef = useLatest(metadata);
  const fkQuery = useMemo(
    () => getForeignKeyQuery(fk, rowId, metadataRef.current),
    [fk, rowId, metadataRef],
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

  const textColor =
    count === 0 ? "text-tertiary" : clickable ? "brand" : "text-secondary";

  return (
    <Flex
      className={cx(S.root, {
        [S.clickable]: clickable,
      })}
      align="center"
      justify="space-between"
      {...(clickable
        ? { component: Link, to: fkQuestionUrl, onClick }
        : undefined)}
    >
      <Stack gap={rem(12)}>
        {isFetching && <Loader data-testid="loading-indicator" size="md" />}

        {!isFetching && (
          <Text c={textColor} className={S.text} fw="bold" fz={rem(24)} lh={1}>
            {error ? t`Unknown` : String(count)}
          </Text>
        )}

        <Text c={textColor} className={S.text} fw="bold" lh={1}>
          {relationName}
        </Text>
      </Stack>

      {clickable && (
        <Icon className={S.icon} name="chevronright" c="brand" aria-hidden />
      )}
    </Flex>
  );
};
