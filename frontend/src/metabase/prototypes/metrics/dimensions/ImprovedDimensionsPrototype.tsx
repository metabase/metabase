/* eslint-disable boundaries/element-types -- throwaway prototype: reuses the real Dimensions tab's pieces. */
import cx from "classnames";
import { type CSSProperties, useState } from "react";

import { useListCardsQuery } from "metabase/api";
import {
  useAddMetricDimensionsMutation,
  useListMetricDimensionsQuery,
  useRemoveMetricDimensionsMutation,
  useReorderMetricDimensionsMutation,
} from "metabase/api/metric";
import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { getDimensionIcon } from "metabase/common/utils/columns";
import { DimensionSettingsPanel } from "metabase/metrics/components/MetricDimensions/DimensionSettingsPanel";
import RealS from "metabase/metrics/components/MetricDimensions/MetricDimensions.module.css";
import {
  getNewDimensionTitle,
  isOrphaned,
} from "metabase/metrics/components/MetricDimensions/utils";
import { MetricPageCard } from "metabase/metrics/components/MetricPageCard";
import {
  ActionIcon,
  Badge,
  Box,
  Checkbox,
  Divider,
  Flex,
  Group,
  Icon,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type {
  AddableMetricDimension,
  CardQueryMetadata,
  DimensionId,
  MetricDimension,
  MetricDimensionGroup,
  MetricId,
} from "metabase-types/api";

import S from "./ImprovedDimensions.module.css";

export function ImprovedDimensionsPrototype() {
  const { data: cards = [], isLoading } = useListCardsQuery({ f: "all" });
  const metrics = cards.filter((c) => c.type === "metric" && !c.archived);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const cardId = pickedId ?? (metrics[0] ? String(metrics[0].id) : null);

  return (
    <Stack gap="md">
      <Select
        w={320}
        placeholder="Pick a metric"
        searchable
        value={cardId}
        data={metrics.map((m) => ({ value: String(m.id), label: m.name }))}
        onChange={setPickedId}
      />
      {isLoading ? null : cardId == null ? (
        <Text c="text-secondary">No metrics in this instance yet.</Text>
      ) : (
        <Box h="calc(100vh - 200px)" mih={600} display="flex">
          <MetricPageCard key={cardId} cardId={cardId}>
            {(card, metadata) => (
              <ImprovedDimensions metricId={card.id} queryMetadata={metadata} />
            )}
          </MetricPageCard>
        </Box>
      )}
    </Stack>
  );
}

type Section = "added" | "available";
type DragItem = { ids: DimensionId[]; from: Section };
type AvailableItem = {
  group: MetricDimensionGroup;
  dimension: AddableMetricDimension;
};

/** Moves `ids` as one block, keeping their order, before `beforeId` or to the end. */
function moveBlock(
  order: DimensionId[],
  ids: DimensionId[],
  beforeId?: DimensionId,
) {
  const rest = order.filter((id) => !ids.includes(id));
  const at = beforeId != null ? rest.indexOf(beforeId) : -1;
  rest.splice(at < 0 ? rest.length : at, 0, ...ids);
  return rest;
}

function ImprovedDimensions({
  metricId,
  queryMetadata,
}: {
  metricId: MetricId;
  queryMetadata: CardQueryMetadata;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<DimensionId | null>(null);
  const [checked, setChecked] = useState<Set<DimensionId>>(new Set());
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [overZone, setOverZone] = useState<Section | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_DURATION);
  const { data, isLoading, error, isFetching } = useListMetricDimensionsQuery({
    metricId,
    "with-addable": true,
    query: debouncedSearch || undefined,
    "include-orphaned": true,
  });
  const [addDimensions] = useAddMetricDimensionsMutation();
  const [removeDimensions] = useRemoveMetricDimensionsMutation();
  const [reorderDimensions] = useReorderMetricDimensionsMutation();

  const added = data?.added ?? [];
  const available: AvailableItem[] = (data?.addable ?? []).flatMap(
    ({ group, dimensions }) =>
      dimensions.map((dimension) => ({ group, dimension })),
  );
  // CSSProperties has no index signature for custom properties.
  const tableColumnStyle = {
    "--table-col-width": `${getTableColumnWidth([
      ...added.map((d) => d.group?.display_name),
      ...available.map(({ group }) => group.display_name),
    ])}px`,
  } as CSSProperties;
  const isSearchActive = search.length > 0 || Boolean(debouncedSearch);
  const selected = added.find((d) => d.id === selectedId) ?? added[0];
  const checkedAdded = added.filter((d) => checked.has(d.id)).map((d) => d.id);
  const checkedAvailable = available
    .filter(({ dimension }) => checked.has(dimension.id))
    .map(({ dimension }) => dimension.id);

  const toggle = (id: DimensionId) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });

  const uncheck = (ids: DimensionId[]) =>
    setChecked((prev) => new Set([...prev].filter((id) => !ids.includes(id))));

  const handleAdd = async (ids: DimensionId[], beforeId?: DimensionId) => {
    const items = available.filter(({ dimension }) =>
      ids.includes(dimension.id),
    );
    uncheck(ids);
    const result = await addDimensions({
      metricId,
      dimensions: items.map(({ group, dimension }) => ({
        ...dimension,
        display_name: getNewDimensionTitle(group, dimension),
      })),
    }).unwrap();
    const newIds = result
      .map((d) => d.id)
      .filter((id) => !added.some((a) => a.id === id));
    if (newIds.length > 0) {
      setSelectedId(newIds[0]);
      if (beforeId != null) {
        reorderDimensions({
          metricId,
          dimension_ids: moveBlock(
            result.map((d) => d.id),
            newIds,
            beforeId,
          ),
        });
      }
    }
  };

  const handleRemove = (ids: DimensionId[]) => {
    uncheck(ids);
    removeDimensions({ metricId, dimension_ids: ids });
  };

  /** Dragging a checked row drags every checked row of its section. */
  const startDrag = (id: DimensionId, from: Section) => {
    const sectionChecked = from === "added" ? checkedAdded : checkedAvailable;
    setDrag({
      ids: sectionChecked.includes(id) ? sectionChecked : [id],
      from,
    });
  };

  const endDrag = () => {
    setDrag(null);
    setOverZone(null);
  };

  const dropOnAdded = (beforeId?: DimensionId) => {
    if (drag?.from === "added" && !isSearchActive) {
      reorderDimensions({
        metricId,
        dimension_ids: moveBlock(
          added.map((d) => d.id),
          drag.ids,
          beforeId,
        ),
      });
    } else if (drag?.from === "available") {
      handleAdd(drag.ids, beforeId);
    }
    endDrag();
  };

  const dropOnAvailable = () => {
    if (drag?.from === "added") {
      handleRemove(drag.ids);
    }
    endDrag();
  };

  const zoneProps = (zone: Section, onDrop: () => void) => ({
    className: cx(S.zone, {
      [S.zoneOver]: overZone === zone && drag != null && drag.from !== zone,
    }),
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOverZone(zone);
    },
    onDragLeave: () => setOverZone(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onDrop();
    },
  });

  const checkedCount = checkedAdded.length + checkedAvailable.length;

  return (
    <Paper withBorder shadow="none" className={RealS.root}>
      <Flex className={RealS.columns}>
        <Stack className={RealS.column} gap="lg">
          <TextInput
            leftSection={<Icon name="search" />}
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
            <ScrollArea
              classNames={{
                viewport: RealS.scrollAreaViewport,
                root: RealS.scrollArea,
              }}
            >
              <Stack gap="xl" style={tableColumnStyle}>
                <Box {...zoneProps("added", () => dropOnAdded())}>
                  <SectionTitle
                    title="Dimensions of this metric"
                    count={added.length}
                  />
                  <Stack gap="sm">
                    {added.length === 0 && (
                      <Text
                        c="text-secondary"
                        size="sm"
                        className={S.emptyZone}
                      >
                        {isSearchActive
                          ? "No dimensions match your search."
                          : "Drag dimensions here to add them to this metric."}
                      </Text>
                    )}
                    {added.map((dimension) => (
                      <DimensionRow
                        key={dimension.id}
                        section="added"
                        dimension={dimension}
                        label={dimension.display_name}
                        table={dimension.group?.display_name}
                        checked={checked.has(dimension.id)}
                        active={dimension.id === selected?.id}
                        isDragging={drag?.ids.includes(dimension.id) ?? false}
                        onToggle={() => toggle(dimension.id)}
                        onClick={() => setSelectedId(dimension.id)}
                        onMove={() => handleRemove([dimension.id])}
                        onDragStart={() => startDrag(dimension.id, "added")}
                        onDragEnd={endDrag}
                        onDropBefore={() => dropOnAdded(dimension.id)}
                      />
                    ))}
                  </Stack>
                </Box>

                <Box {...zoneProps("available", dropOnAvailable)}>
                  <SectionTitle
                    title="Dimensions not in this metric"
                    count={available.length}
                  />
                  <Stack gap="sm">
                    {available.length === 0 && (
                      <Text
                        c="text-secondary"
                        size="sm"
                        className={S.emptyZone}
                      >
                        {isSearchActive
                          ? "No dimensions match your search."
                          : "Every dimension is in this metric."}
                      </Text>
                    )}
                    {available.map(({ group, dimension }) => (
                      <DimensionRow
                        key={dimension.id}
                        section="available"
                        dimension={dimension}
                        label={dimension.display_name}
                        table={group.display_name}
                        checked={checked.has(dimension.id)}
                        isDragging={drag?.ids.includes(dimension.id) ?? false}
                        onToggle={() => toggle(dimension.id)}
                        onClick={() => toggle(dimension.id)}
                        onMove={() => handleAdd([dimension.id])}
                        onDragStart={() => startDrag(dimension.id, "available")}
                        onDragEnd={endDrag}
                      />
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </ScrollArea>
          </LoadingAndErrorWrapper>
        </Stack>

        <Divider orientation="vertical" />

        {selected ? (
          <DimensionSettingsPanel
            key={selected.id}
            dimension={selected}
            isFetching={isFetching}
            metricId={metricId}
            queryMetadata={queryMetadata}
          />
        ) : (
          <EmptyState
            className={RealS.column}
            message="Add a dimension to see its settings here."
          />
        )}
      </Flex>

      <BulkActionBar
        opened={checkedCount > 0}
        message={
          checkedCount === 1
            ? "1 dimension selected"
            : `${checkedCount} dimensions selected`
        }
      >
        {checkedAvailable.length > 0 && (
          <BulkActionButton onClick={() => handleAdd(checkedAvailable)}>
            Add to metric
          </BulkActionButton>
        )}
        {checkedAdded.length > 0 && (
          <BulkActionButton onClick={() => handleRemove(checkedAdded)}>
            Remove from metric
          </BulkActionButton>
        )}
        <UnstyledButton
          aria-label="Clear selection"
          c="tooltip-text"
          display="flex"
          ml="xs"
          onClick={() => setChecked(new Set())}
        >
          <Icon name="close" />
        </UnstyledButton>
      </BulkActionBar>
    </Paper>
  );
}

let measureCanvas: HTMLCanvasElement | undefined;

/** Width of the widest table label (icon + gap + text), so the column hugs it. */
function getTableColumnWidth(tables: (string | undefined)[]): number {
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) {
    return 0;
  }
  const rootPx = parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  ctx.font = `400 ${0.875 * rootPx}px ${getComputedStyle(document.body).fontFamily}`;
  const text = Math.max(
    0,
    ...tables.map((table) => (table ? ctx.measureText(table).width : 0)),
  );
  const ACTIONS_W = 56; // the two hover buttons need this much room
  return Math.max(ACTIONS_W, Math.ceil(text) + 12 + 4);
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <Group gap="xs" mb="sm">
      <Title order={5}>{title}</Title>
      <Text c="text-secondary" size="sm">
        {count}
      </Text>
    </Group>
  );
}

function DimensionRow({
  section,
  dimension,
  label,
  table,
  checked,
  active = false,
  isDragging,
  onToggle,
  onClick,
  onMove,
  onDragStart,
  onDragEnd,
  onDropBefore,
}: {
  section: Section;
  dimension: MetricDimension;
  label: string;
  table?: string;
  checked: boolean;
  active?: boolean;
  isDragging: boolean;
  onToggle: () => void;
  onClick: () => void;
  onMove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore?: () => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const isAvailable = section === "available";
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={
        onDropBefore &&
        ((e) => {
          e.preventDefault();
          setIsOver(true);
        })
      }
      onDragLeave={() => setIsOver(false)}
      onDrop={
        onDropBefore &&
        ((e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(false);
          onDropBefore();
        })
      }
      className={cx(RealS.row, S.row, {
        [RealS.rowActive]: active,
        [S.availableRow]: isAvailable,
        [S.dragging]: isDragging,
        [S.dropBefore]: isOver,
      })}
    >
      <Checkbox aria-label={label} checked={checked} onChange={onToggle} />
      <UnstyledButton className={RealS.rowButton} onClick={onClick}>
        <Group gap="sm" wrap="nowrap">
          <Icon name={getDimensionIcon(dimension)} c="text-secondary" />
          <Group gap="sm" wrap="nowrap" flex={1} miw={0}>
            <Text
              miw={0}
              truncate="end"
              c={isAvailable ? "text-secondary" : undefined}
            >
              {label}
            </Text>
            {dimension.default && (
              <Badge variant="light" flex="none">
                Default
              </Badge>
            )}
          </Group>
          {isOrphaned(dimension) && (
            <Icon
              name="warning"
              c="feedback-warning"
              tooltip="This column is no longer available in the metric's data"
            />
          )}
        </Group>
      </UnstyledButton>
      <Box className={S.trailing}>
        {table && (
          <Group gap={4} wrap="nowrap" className={S.table}>
            <Icon name="table" size={12} c="icon-disabled" flex="none" />
            <Text size="sm" c="text-secondary" truncate="end">
              {table}
            </Text>
          </Group>
        )}
        <Group gap="sm" wrap="nowrap" className={cx(S.hoverAction, S.actions)}>
          <Tooltip label={isAvailable ? "Add to metric" : "Remove from metric"}>
            <ActionIcon
              className={S.hoverAction}
              aria-label={isAvailable ? "Add to metric" : "Remove from metric"}
              variant="subtle"
              c="text-secondary"
              size="sm"
              onClick={onMove}
            >
              <Icon name="sort_arrows" size={14} />
            </ActionIcon>
          </Tooltip>
          <Icon
            name="grabber"
            c="text-secondary"
            className={cx(S.hoverAction, S.grab)}
          />
        </Group>
      </Box>
    </Group>
  );
}
