import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  useListMetricDimensionsQuery,
  useRemoveMetricDimensionsMutation,
  useReorderMetricDimensionsMutation,
} from "metabase/api/metric";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Box, Divider, Flex, Paper } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { DimensionId, MetricId } from "metabase-types/api";

import { AddDimensionsPanel } from "./AddDimensionsPanel";
import { DimensionList } from "./DimensionList";
import { DimensionSettingsPanel } from "./DimensionSettingsPanel";
import S from "./MetricDimensions.module.css";

type DetailMode =
  | { type: "idle" }
  | { type: "add" }
  | { type: "edit"; dimensionId: DimensionId };

interface MetricDimensionsProps {
  metricId: MetricId;
}

export function MetricDimensions({ metricId }: MetricDimensionsProps) {
  const dispatch = useDispatch();
  const [search, setSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<DimensionId>>(new Set());
  const [mode, setMode] = useState<DetailMode>({ type: "idle" });

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);
  const { data, isLoading, error, isFetching } = useListMetricDimensionsQuery({
    metricId,
    query: debouncedSearch || undefined,
  });
  const [removeDimensions] = useRemoveMetricDimensionsMutation();
  const [reorderDimensions] = useReorderMetricDimensionsMutation();

  const dimensions = data?.added ?? [];

  const handleToggle = (id: DimensionId, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleRemove = async () => {
    const ids = Array.from(checkedIds);
    try {
      await removeDimensions({ metricId, dimension_ids: ids }).unwrap();
      setCheckedIds(new Set());
      setMode((current) =>
        current.type === "edit" && ids.includes(current.dimensionId)
          ? { type: "idle" }
          : current,
      );
    } catch {
      dispatch(
        addUndo({ message: t`Couldn't remove the selected dimensions` }),
      );
    }
  };

  const handleReorder = async (ids: DimensionId[]) => {
    try {
      await reorderDimensions({ metricId, dimension_ids: ids }).unwrap();
    } catch {
      dispatch(addUndo({ message: t`Couldn't reorder the dimensions` }));
    }
  };

  const activeId = mode.type === "edit" ? mode.dimensionId : null;

  return (
    <Paper
      withBorder
      shadow="none"
      className={S.root}
      data-testid="metric-dimensions"
    >
      <Flex className={S.columns}>
        <DimensionList
          dimensions={dimensions}
          isLoading={isLoading}
          error={error}
          search={search}
          checkedIds={checkedIds}
          activeId={activeId}
          isAddDisabled={mode.type === "add" || checkedIds.size > 0}
          onSearchChange={setSearch}
          onToggle={handleToggle}
          onAdd={() => setMode({ type: "add" })}
          onRemove={handleRemove}
          onEdit={(dimensionId) => setMode({ type: "edit", dimensionId })}
          onReorder={handleReorder}
        />

        <Divider orientation="vertical" />

        {match(mode)
          .with({ type: "idle" }, () => <Box className={S.column} />)
          .with({ type: "add" }, () => (
            <AddDimensionsPanel
              metricId={metricId}
              onDone={() => setMode({ type: "idle" })}
            />
          ))
          .with({ type: "edit" }, ({ dimensionId }) => {
            const dimension = dimensions.find(
              (item) => item.id === dimensionId,
            );
            return dimension ? (
              <DimensionSettingsPanel
                dimension={dimension}
                isFetching={isFetching}
                key={dimension.id}
                metricId={metricId}
              />
            ) : (
              <Box className={S.column} />
            );
          })
          .exhaustive()}
      </Flex>
    </Paper>
  );
}
