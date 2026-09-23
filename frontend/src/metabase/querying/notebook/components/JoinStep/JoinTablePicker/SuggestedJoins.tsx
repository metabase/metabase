import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import {
  type JevJoinEdge,
  useSuggestJoinEdgesMutation,
} from "metabase/api/jev";
import { Box, Menu, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

export function SuggestedJoins({
  query,
  stageIndex,
  onSelect,
}: {
  query: Lib.Query;
  stageIndex: number;
  onSelect: (tableId: number) => Promise<void>;
}) {
  const [findJoins] = useSuggestJoinEdgesMutation();
  const [edges, setEdges] = useState<JevJoinEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string>();
  const key = JSON.stringify([Lib.toJsQuery(query), stageIndex]);
  const latest = useRef(key);
  latest.current = key;
  const source = Lib.sourceTableOrCardId(query);
  const ids =
    typeof source === "number" &&
    (stageIndex === 0 || (stageIndex === -1 && Lib.stageCount(query) === 1))
      ? [
          ...new Set([
            source,
            ...Lib.joins(query, stageIndex)
              .map(
                (j) =>
                  Lib.pickerInfo(query, Lib.joinedThing(query, j))?.tableId,
              )
              .filter((id): id is number => typeof id === "number"),
          ]),
        ]
      : [];
  const idsKey = JSON.stringify(ids);
  const context = JSON.stringify({
    filters: Lib.filters(query, stageIndex).map(
      (c) => Lib.displayInfo(query, stageIndex, c).displayName,
    ),
    aggregations: Lib.aggregations(query, stageIndex).map(
      (c) => Lib.displayInfo(query, stageIndex, c).displayName,
    ),
    breakouts: Lib.breakouts(query, stageIndex).map(
      (c) => Lib.displayInfo(query, stageIndex, c).displayName,
    ),
    selected_fields: Lib.fields(query, stageIndex).map(
      (c) => Lib.displayInfo(query, stageIndex, c).displayName,
    ),
  }).slice(0, 3000);
  useEffect(() => {
    let active = true;
    setEdges([]);
    setError(undefined);
    setLoading(true);
    if (!ids.length || ids.length > 6) {
      setLoading(false);
      return;
    }
    const request = findJoins({
      source_table_ids: JSON.parse(idsKey),
      query_context: context,
    });
    request
      .unwrap()
      .then((result) => {
        if (active) {
          setEdges(result.suggestions);
          if (result.status === "unavailable" && !result.suggestions.length) {
            setError(t`Suggestions unavailable. Browse tables below.`);
          }
        }
      })
      .catch(() => {
        if (active) {
          setError(t`Suggestions unavailable. Browse tables below.`);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
      request.abort();
    };
    // The serialized IDs keep requests stable across metadata updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, context, findJoins]);

  useEffect(
    () => () => {
      latest.current = "unmounted";
    },
    [],
  );

  const select = async (edge: JevJoinEdge) => {
    setSelecting(true);
    setError(undefined);
    try {
      await onSelect(edge.table_id);
    } catch (e) {
      if (latest.current === key) {
        setError(e instanceof Error ? e.message : t`Could not add this join.`);
      }
    } finally {
      if (latest.current === key) {
        setSelecting(false);
      }
    }
  };

  if (!ids.length || ids.length > 6) {
    return null;
  }
  return (
    <Box maw={460} data-testid="suggested-joins">
      <Menu.Label>{t`Adjacent tables`}</Menu.Label>
      {loading && (
        <Text
          px="md"
          py="xs"
          size="sm"
          c="text-secondary"
        >{t`Finding related tables…`}</Text>
      )}
      {error && (
        <Text px="md" py="xs" size="sm" role="status">
          {error}
        </Text>
      )}
      {!loading && !error && !edges.length && (
        <Text
          px="md"
          py="xs"
          size="sm"
          c="text-secondary"
        >{t`No clear matches found. Browse tables below.`}</Text>
      )}
      {edges.slice(0, 5).map((edge) => (
        <Menu.Item
          key={`${edge.source_field_id}-${edge.target_field_id}`}
          disabled={selecting}
          onClick={() => select(edge)}
        >
          <Text fw="bold" size="sm">
            {edge.table_name}
          </Text>
          <Text size="xs" c="text-secondary">
            {edge.schema ? `${edge.schema} · ` : ""}
            {edge.existing_fk ? t`Foreign key` : t`Suggested relationship`}
          </Text>
        </Menu.Item>
      ))}
      <Menu.Divider />
      <Menu.Label>{t`Browse all tables`}</Menu.Label>
    </Box>
  );
}
